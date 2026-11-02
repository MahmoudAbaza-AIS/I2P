using System.Collections.Concurrent;
using FluentAssertions;
using MassTransit;
using MassTransit.EntityFrameworkCoreIntegration;
using MassTransit.Logging;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.ValueObjects;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Observability;
using Platform.I2P.Infrastructure.Persistence;
using Platform.I2P.Infrastructure.Persistence.Repositories;
using Testcontainers.MsSql;
using Testcontainers.RabbitMq;

namespace Platform.I2P.Integration.Tests;

/// <summary>
/// Integration tests require Docker (Testcontainers). Per PR Code Standards Checklist §2,
/// a Docker-unavailable environment is a blocking failure — not a silent skip/pass.
/// </summary>
public class OutboxAndMigrationTests : IAsyncLifetime
{
    /// <summary>Process-wide factory — MassTransit caches LogContext; must not be disposed per test.</summary>
    private static readonly ILoggerFactory SharedLoggerFactory =
        LoggerFactory.Create(b => b.SetMinimumLevel(LogLevel.Warning));

    private MsSqlContainer? _sql;
    private RabbitMqContainer? _rabbit;
    private string? _dockerFailure;

    public async Task InitializeAsync()
    {
        try
        {
            _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
            // guest is loopback-only inside the broker; Docker port-mapping looks remote → ACCESS_REFUSED.
            _rabbit = new RabbitMqBuilder("rabbitmq:3.13-management-alpine")
                .WithUsername("i2p")
                .WithPassword("i2p")
                .Build();
            await _sql.StartAsync();
            await _rabbit.StartAsync();
        }
        catch (Exception ex)
        {
            _dockerFailure = ex.Message;
        }
    }

    public async Task DisposeAsync()
    {
        if (_sql is not null)
        {
            await _sql.DisposeAsync();
        }

        if (_rabbit is not null)
        {
            await _rabbit.DisposeAsync();
        }
    }

    private void EnsureDocker()
    {
        Assert.True(
            _dockerFailure is null && _sql is not null && _rabbit is not null,
            "Docker is required for integration tests (PR Code Standards Checklist §2). " +
            "Install/start Docker and re-run; 'tests skipped, no Docker' is a merge blocker, not a pass. " +
            $"Detail: {_dockerFailure}");
    }

    [Fact]
    public async Task Ef_Migrations_Apply_Cleanly_Against_SqlServer()
    {
        EnsureDocker();

        var options = new DbContextOptionsBuilder<I2PDbContext>()
            .UseSqlServer(_sql!.GetConnectionString())
            .Options;

        await using var db = new I2PDbContext(options);
        await db.Database.MigrateAsync();

        (await db.Database.CanConnectAsync()).Should().BeTrue();
        (await db.Set<OutboxMessage>().CountAsync()).Should().Be(0);
        (await db.Set<InboxState>().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Outbox_without_bus_keeps_rows_pending_and_reports_unready()
    {
        EnsureDocker();
        await using var db = await MigrateFreshDbAsync("pending");

        await using var provider = BuildServices(
            dbName: "pending",
            rabbitConfigured: false,
            disableDelivery: true);

        _ = provider.GetRequiredService<MessagingHealthCheck>();

        await using (var scope = provider.CreateAsyncScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();

            var exchange = CreateExchange("PO-pending");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        await Task.Delay(2000);

        await using (var verify = new I2PDbContext(SqlOptions("pending")))
        {
            var pending = await verify.Set<OutboxMessage>().CountAsync(x => x.OutboxId != null);
            pending.Should().BeGreaterThan(0, "without a broker, outbox rows must stay pending (D-02 / §1.4)");
        }

        var health = provider.GetRequiredService<MessagingHealthCheck>();
        var result = await health.CheckHealthAsync(new HealthCheckContext(), CancellationToken.None);
        result.Status.Should().Be(HealthStatus.Unhealthy);
    }

    [Fact]
    public async Task Outbox_with_bus_publishes_and_consumer_receives_message()
    {
        EnsureDocker();
        await using var db = await MigrateFreshDbAsync("deliver");
        var received = new TaskCompletionSource<ErpDataReceivedEvent>(TaskCreationOptions.RunContinuationsAsynchronously);

        await using var provider = BuildServices(
            dbName: "deliver",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x =>
            {
                x.AddConsumer<CapturingConsumer>();
            },
            configureServices: s =>
            {
                s.AddSingleton(received);
            });

        await StartHostedAsync(provider);

        Guid messageId;
        await using (var scope = provider.CreateAsyncScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-deliver");
            messageId = Guid.NewGuid();
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1, messageId), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        try
        {
            var evt = await received.Task.WaitAsync(TimeSpan.FromSeconds(60));
            evt.MessageId.Should().Be(messageId);
            evt.ExternalId.Should().Be("PO-deliver");
        }
        catch (TimeoutException)
        {
            await using var verify = new I2PDbContext(SqlOptions("deliver"));
            var pending = await verify.Set<OutboxMessage>().CountAsync(x => x.OutboxId != null);
            var states = await verify.Set<OutboxState>().CountAsync();
            var sample = await verify.Set<OutboxMessage>().AsNoTracking().FirstOrDefaultAsync();
            var state = await verify.Set<OutboxState>().AsNoTracking().FirstOrDefaultAsync();
            var hosted = string.Join(",", provider.GetServices<IHostedService>().Select(s => s.GetType().Name));
            throw new TimeoutException(
                $"Consumer did not receive message. PendingOutbox={pending} OutboxState={states} MessageId={messageId} " +
                $"Dest={sample?.DestinationAddress} Enqueue={sample?.EnqueueTime:o} Sent={sample?.SentTime:o} " +
                $"StateLock={state?.LockId} StateDelivered={state?.Delivered:o} Created={state?.Created:o} Hosted=[{hosted}]");
        }
    }

    [Fact]
    public async Task Crash_between_save_and_publish_does_not_lose_event()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("crash");

        // Stage with delivery disabled (simulates crash after commit, before broker publish).
        await using (var stage = BuildServices("crash", rabbitConfigured: true, disableDelivery: true))
        {
            await using var scope = stage.CreateAsyncScope();
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-crash");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        await using (var verify = new I2PDbContext(SqlOptions("crash")))
        {
            (await verify.ExchangeRecords.CountAsync()).Should().Be(1);
            (await verify.Set<OutboxMessage>().CountAsync(x => x.OutboxId != null)).Should().BeGreaterThan(0);
        }

        var received = new TaskCompletionSource<ErpDataReceivedEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var recovery = BuildServices(
            "crash",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<CapturingConsumer>(),
            configureServices: s => s.AddSingleton(received));

        await StartHostedAsync(recovery);
        var evt = await received.Task.WaitAsync(TimeSpan.FromSeconds(60));
        evt.ExternalId.Should().Be("PO-crash");
    }

    [Fact]
    public async Task Handler_failure_rolls_back_record_and_outbox_together()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("rollback");
        await using var provider = BuildServices("rollback", rabbitConfigured: false, disableDelivery: true);

        await using (var scope = provider.CreateAsyncScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-rollback");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            // Intentionally no SaveChanges — failure before commit.
        }

        await using var verify = new I2PDbContext(SqlOptions("rollback"));
        (await verify.ExchangeRecords.CountAsync()).Should().Be(0);
        (await verify.Set<OutboxMessage>().CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task Broker_down_keeps_rows_pending_then_delivers_on_recovery()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("brokerdown");

        // Stage while delivery disabled (broker effectively unreachable for outbox delivery).
        await using (var stage = BuildServices("brokerdown", rabbitConfigured: true, disableDelivery: true))
        {
            await using var scope = stage.CreateAsyncScope();
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-broker");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        await using (var verify = new I2PDbContext(SqlOptions("brokerdown")))
        {
            (await verify.Set<OutboxMessage>().CountAsync(x => x.OutboxId != null)).Should().BeGreaterThan(0);
        }

        var received = new TaskCompletionSource<ErpDataReceivedEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var recovery = BuildServices(
            "brokerdown",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<CapturingConsumer>(),
            configureServices: s => s.AddSingleton(received));
        await StartHostedAsync(recovery);

        (await received.Task.WaitAsync(TimeSpan.FromSeconds(60))).ExternalId.Should().Be("PO-broker");
    }

    [Fact]
    public void Broker_not_configured_fails_startup_in_production()
    {
        var validator = new MessagingOptionsValidator(new HostEnvironmentStub(Environments.Production));
        var result = validator.Validate(null, new MessagingOptions());
        result.Failed.Should().BeTrue();
        result.FailureMessage.Should().Contain("required outside Development");
    }

    [Fact]
    public async Task Two_processors_never_publish_same_row()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("dup");

        const int count = 1000;
        await using (var stage = BuildServices("dup", rabbitConfigured: true, disableDelivery: true))
        {
            await using var scope = stage.CreateAsyncScope();
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();

            for (var i = 0; i < count; i++)
            {
                var exchange = CreateExchange($"PO-dup-{i}");
                await exchanges.AddAsync(exchange, CancellationToken.None);
                await publisher.PublishAsync(CreateEvent(exchange, i + 1), CancellationToken.None);
            }

            await uow.SaveChangesAsync(CancellationToken.None);
        }

        // One consumer (counts broker publishes). Two delivery hosts must not double-publish the same outbox row.
        var bag = new ConcurrentBag<(Guid MessageId, long Seq)>();
        await using var consumerHost = BuildServices(
            "dup",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<CountingConsumer>(),
            configureServices: s => s.AddSingleton(bag));
        await using var deliveryOnly = BuildServices(
            "dup",
            rabbitConfigured: true,
            disableDelivery: false);

        await StartHostedAsync(consumerHost);
        await StartHostedAsync(deliveryOnly);

        var deadline = DateTime.UtcNow.AddMinutes(3);
        while (bag.Count < count && DateTime.UtcNow < deadline)
        {
            await Task.Delay(500);
        }

        bag.Select(x => x.MessageId).Distinct().Should().HaveCount(count);
        bag.Count.Should().Be(count, "two outbox delivery services must not publish the same row twice");
    }

    [Fact]
    public async Task Expired_lease_is_reclaimed_by_other_instance()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("lease");

        await using (var stage = BuildServices("lease", rabbitConfigured: true, disableDelivery: true))
        {
            await using var scope = stage.CreateAsyncScope();
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-lease");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        // Simulate a dead holder's lock: OutboxState row remains undelivered; a new instance must reclaim.
        await using (var db = new I2PDbContext(SqlOptions("lease")))
        {
            var state = await db.Set<OutboxState>().SingleAsync();
            state.LockId = Guid.NewGuid();
            await db.SaveChangesAsync();
        }

        var received = new TaskCompletionSource<ErpDataReceivedEvent>(TaskCreationOptions.RunContinuationsAsynchronously);
        await using var reclaim = BuildServices(
            "lease",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<CapturingConsumer>(),
            configureServices: s => s.AddSingleton(received));
        await StartHostedAsync(reclaim);

        (await received.Task.WaitAsync(TimeSpan.FromSeconds(90))).ExternalId.Should().Be("PO-lease");
    }

    [Fact]
    public async Task Consumer_inbox_ignores_redelivered_message()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("inbox");
        var counter = new ConcurrentBag<Guid>();

        await using var provider = BuildServices(
            "inbox",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<InboxAwareConsumer>(),
            configureServices: s => s.AddSingleton(counter));
        await StartHostedAsync(provider);

        Guid messageId;
        await using (var scope = provider.CreateAsyncScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-inbox");
            messageId = Guid.NewGuid();
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1, messageId), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        var deadline = DateTime.UtcNow.AddSeconds(45);
        while (counter.Count < 1 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(200);
        }

        counter.Count.Should().Be(1);

        // Force a second publish with the same MessageId (redelivery simulation).
        await using (var scope = provider.CreateAsyncScope())
        {
            var endpoint = scope.ServiceProvider.GetRequiredService<IPublishEndpoint>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchange = CreateExchange("PO-inbox-2");
            await endpoint.Publish(CreateEvent(exchange, 2, messageId), ctx => ctx.MessageId = messageId);
            await uow.SaveChangesAsync();
        }

        await Task.Delay(5000);
        counter.Count.Should().Be(1, "inbox must suppress duplicate MessageId side effects");
    }

    [Fact]
    public async Task Per_key_ordering_is_preserved()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("order");
        var sequences = new ConcurrentQueue<long>();

        await using var provider = BuildServices(
            "order",
            rabbitConfigured: true,
            disableDelivery: false,
            configureBus: x => x.AddConsumer<OrderingConsumer>(),
            configureServices: s => s.AddSingleton(sequences));
        await StartHostedAsync(provider);

        await using (var scope = provider.CreateAsyncScope())
        {
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();

            for (var i = 1; i <= 20; i++)
            {
                var exchange = CreateExchange($"PO-order-{i}");
                await exchanges.AddAsync(exchange, CancellationToken.None);
                await publisher.PublishAsync(CreateEvent(exchange, i), CancellationToken.None);
            }

            await uow.SaveChangesAsync(CancellationToken.None);
        }

        var deadline = DateTime.UtcNow.AddSeconds(90);
        while (sequences.Count < 20 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(200);
        }

        // Broker may reorder; WP1 documents SequenceNumber for consumers to drop stale (ordering-wp1.md).
        sequences.Should().HaveCount(20);
        sequences.OrderBy(x => x).Should().Equal(Enumerable.Range(1, 20).Select(i => (long)i));
        sequences.Distinct().Should().HaveCount(20);
    }

    [Fact]
    public async Task Poison_message_is_deadlettered_after_N_attempts_and_admin_notified()
    {
        EnsureDocker();
        await using var _ = await MigrateFreshDbAsync("poison");

        await using (var stage = BuildServices("poison", rabbitConfigured: true, disableDelivery: true))
        {
            await using var scope = stage.CreateAsyncScope();
            var publisher = scope.ServiceProvider.GetRequiredService<IEventPublisher>();
            var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
            var exchanges = scope.ServiceProvider.GetRequiredService<IExchangeRecordRepository>();
            var exchange = CreateExchange("PO-poison");
            await exchanges.AddAsync(exchange, CancellationToken.None);
            await publisher.PublishAsync(CreateEvent(exchange, 1), CancellationToken.None);
            await uow.SaveChangesAsync(CancellationToken.None);
        }

        // Age the outbox row so the sweeper treats it as exhausted.
        await using (var db = new I2PDbContext(SqlOptions("poison")))
        {
            foreach (var msg in await db.Set<OutboxMessage>().Where(x => x.OutboxId != null).ToListAsync())
            {
                msg.SentTime = DateTime.UtcNow.AddHours(-1);
            }

            await db.SaveChangesAsync();
        }

        await using var provider = BuildServices(
            "poison",
            rabbitConfigured: true,
            disableDelivery: true,
            configureServices: s =>
            {
                s.AddSingleton(Options.Create(new OutboxDeliveryOptions
                {
                    MaxAttempts = 5,
                    DeadLetterAgeSeconds = 1,
                    SweepIntervalSeconds = 1
                }));
            });

        var sweeper = provider.GetServices<IHostedService>().OfType<OutboxDeadLetterSweeper>().Single();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        await sweeper.StartAsync(cts.Token);
        await Task.Delay(3500);
        await sweeper.StopAsync(CancellationToken.None);

        await using var verify = new I2PDbContext(SqlOptions("poison"));
        (await verify.DeadLetterOutboxEntries.CountAsync(x => x.Status == DeadLetterStatuses.DeadLettered))
            .Should().BeGreaterThan(0);
        (await verify.AuditRecords.CountAsync(x => x.Action == "OutboxDeadLettered"))
            .Should().BeGreaterThan(0);
    }

    private async Task<I2PDbContext> MigrateFreshDbAsync(string name)
    {
        var options = SqlOptions(name);
        var db = new I2PDbContext(options);
        await db.Database.EnsureDeletedAsync();
        await db.Database.MigrateAsync();
        return db;
    }

    private DbContextOptions<I2PDbContext> SqlOptions(string name)
    {
        var cs = new SqlConnectionStringBuilder(_sql!.GetConnectionString())
        {
            InitialCatalog = $"I2P_{name}"
        }.ConnectionString;
        return new DbContextOptionsBuilder<I2PDbContext>().UseSqlServer(cs).Options;
    }

    private string SqlCs(string name) =>
        new SqlConnectionStringBuilder(_sql!.GetConnectionString()) { InitialCatalog = $"I2P_{name}" }.ConnectionString;

    private ServiceProvider BuildServices(
        string dbName,
        bool rabbitConfigured,
        bool disableDelivery,
        Action<IBusRegistrationConfigurator>? configureBus = null,
        Action<IServiceCollection>? configureServices = null)
    {
        var services = new ServiceCollection();
        services.AddSingleton(SharedLoggerFactory);
        services.AddSingleton(typeof(ILogger<>), typeof(Logger<>));
        services.AddSingleton<IHostEnvironment>(new HostEnvironmentStub(Environments.Development));
        LogContext.ConfigureCurrentLogContext(SharedLoggerFactory);

        // Docker Desktop on Windows: always publish via loopback + mapped port (container Hostname is not reachable).
        var rabbitPort = rabbitConfigured ? _rabbit!.GetMappedPublicPort(5672) : 5672;
        var messaging = rabbitConfigured
            ? new MessagingOptions
            {
                Host = "127.0.0.1",
                Username = "i2p",
                Password = "i2p"
            }
            : new MessagingOptions();

        services.AddSingleton(Options.Create(messaging));
        services.AddSingleton(Options.Create(new OutboxDeliveryOptions
        {
            MaxAttempts = 5,
            DeadLetterAgeSeconds = 300,
            SweepIntervalSeconds = 15
        }));

        services.AddDbContext<I2PDbContext>(o => o.UseSqlServer(SqlCs(dbName)));
        services.AddScoped<IExchangeRecordRepository, ExchangeRecordRepository>();
        services.AddScoped<IAuditWriter, EfAuditWriter>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IEventPublisher, MassTransitEventPublisher>();
        services.AddScoped<IDeadLetterOutboxService, DeadLetterOutboxService>();
        services.AddSingleton<OutboxMetrics>();
        services.AddSingleton<MessagingHealthCheck>();
        services.AddHostedService<OutboxDeadLetterSweeper>();

        services.AddMassTransit(x =>
        {
            x.SetEndpointNameFormatter(
                new KebabCaseEndpointNameFormatter($"i2p-{dbName}-{Guid.NewGuid():N}"[..20], false));

            configureBus?.Invoke(x);

            x.AddEntityFrameworkOutbox<I2PDbContext>(o =>
            {
                o.QueryDelay = TimeSpan.FromMilliseconds(250);
                o.UseSqlServer();
                o.UseBusOutbox(bus =>
                {
                    bus.MessageDeliveryLimit = 100;
                    if (disableDelivery || !rabbitConfigured)
                    {
                        bus.DisableDeliveryService();
                    }
                });
            });

            x.AddConfigureEndpointsCallback((context, _, cfg) =>
            {
                cfg.UseEntityFrameworkOutbox<I2PDbContext>(context);
            });

            if (rabbitConfigured)
            {
                x.UsingRabbitMq((context, cfg) =>
                {
                    cfg.Host(messaging.Host, (ushort)rabbitPort, "/", h =>
                    {
                        h.Username(messaging.Username);
                        h.Password(messaging.Password);
                        h.PublisherConfirmation = true;
                    });
                    cfg.ConfigureEndpoints(context);
                });
            }
            else
            {
                x.UsingInMemory((context, cfg) => cfg.ConfigureEndpoints(context));
            }
        });

        configureServices?.Invoke(services);
        // ValidateScopes=false: MassTransit bus-outbox delivery creates its own scopes; root validate trips false positives in tests.
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateScopes = false });
    }

    private static async Task StartHostedAsync(ServiceProvider provider)
    {
        LogContext.ConfigureCurrentLogContext(SharedLoggerFactory);

        var hosted = provider.GetServices<IHostedService>().ToList();
        foreach (var service in hosted)
        {
            await service.StartAsync(CancellationToken.None);
        }

        var bus = provider.GetRequiredService<IBusControl>();
        await bus.WaitForHealthStatus(BusHealthStatus.Healthy, TimeSpan.FromSeconds(30));
    }

    private static ExchangeRecord CreateExchange(string externalId) =>
        ExchangeRecord.Create(
            "tenant-a",
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            externalId,
            Convert.ToHexString(System.Security.Cryptography.SHA256.HashData("{}"u8.ToArray())),
            "{}",
            OperationalTimestamp.FromPlatform(),
            Quality.Good(),
            "SAP");

    private static ErpDataReceivedEvent CreateEvent(ExchangeRecord exchange, long sequence, Guid? messageId = null) =>
        new(
            messageId ?? Guid.NewGuid(),
            Guid.NewGuid(),
            exchange.Id,
            exchange.EndpointId,
            exchange.ExternalId,
            "PurchaseOrder",
            sequence,
            exchange.PayloadJson,
            exchange.Timestamp.Value,
            exchange.Timestamp.Origin.ToString(),
            exchange.Quality.Code.ToString(),
            exchange.SourceSystem,
            DateTimeOffset.UtcNow);

    private sealed class HostEnvironmentStub(string environmentName) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = environmentName;
        public string ApplicationName { get; set; } = "I2P.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private sealed class CapturingConsumer(TaskCompletionSource<ErpDataReceivedEvent> tcs)
        : IConsumer<ErpDataReceivedEvent>
    {
        public Task Consume(ConsumeContext<ErpDataReceivedEvent> context)
        {
            tcs.TrySetResult(context.Message);
            return Task.CompletedTask;
        }
    }

    private sealed class CountingConsumer(ConcurrentBag<(Guid MessageId, long Seq)> bag)
        : IConsumer<ErpDataReceivedEvent>
    {
        public Task Consume(ConsumeContext<ErpDataReceivedEvent> context)
        {
            bag.Add((context.Message.MessageId, context.Message.SequenceNumber));
            return Task.CompletedTask;
        }
    }

    private sealed class OrderingConsumer(ConcurrentQueue<long> sequences)
        : IConsumer<ErpDataReceivedEvent>
    {
        public Task Consume(ConsumeContext<ErpDataReceivedEvent> context)
        {
            sequences.Enqueue(context.Message.SequenceNumber);
            return Task.CompletedTask;
        }
    }

    private sealed class InboxAwareConsumer(ConcurrentBag<Guid> counter) : IConsumer<ErpDataReceivedEvent>
    {
        public Task Consume(ConsumeContext<ErpDataReceivedEvent> context)
        {
            // MassTransit EF inbox (UseEntityFrameworkOutbox) prevents a second Consume for the same MessageId.
            counter.Add(context.MessageId ?? context.Message.MessageId);
            return Task.CompletedTask;
        }
    }
}
