using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Persistence;
using Testcontainers.MsSql;
using Testcontainers.RabbitMq;

namespace Platform.I2P.Integration.Tests;

/// <summary>
/// Integration tests require Docker (Testcontainers). Per PR Code Standards Checklist §2,
/// a Docker-unavailable environment is a blocking failure — not a silent skip/pass.
/// </summary>
public class OutboxAndMigrationTests : IAsyncLifetime
{
    private MsSqlContainer? _sql;
    private RabbitMqContainer? _rabbit;
    private string? _dockerFailure;

    public async Task InitializeAsync()
    {
        try
        {
            _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
            _rabbit = new RabbitMqBuilder("rabbitmq:3.13-management-alpine").Build();
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
    }

    [Fact]
    public async Task Outbox_Processor_Marks_Messages_Processed()
    {
        EnsureDocker();

        var options = new DbContextOptionsBuilder<I2PDbContext>()
            .UseSqlServer(_sql!.GetConnectionString())
            .Options;

        await using (var setup = new I2PDbContext(options))
        {
            await setup.Database.MigrateAsync();
            setup.OutboxMessages.Add(new OutboxMessage
            {
                Id = Guid.NewGuid(),
                TypeName = typeof(ErpDataReceivedEvent).FullName!,
                PayloadJson = """{"ExchangeId":"00000000-0000-0000-0000-000000000001","EndpointId":"00000000-0000-0000-0000-000000000002","ExternalId":"PO-1","PayloadJson":"{}","SourceTimestampUtc":"2024-01-01T00:00:00Z","Quality":"Good","SourceSystem":"SAP","PublishedAtUtc":"2024-01-01T00:00:00Z"}""",
                CreatedAtUtc = DateTimeOffset.UtcNow,
                Status = OutboxStatuses.Pending
            });
            await setup.SaveChangesAsync();
        }

        var services = new ServiceCollection();
        services.AddDbContext<I2PDbContext>(o => o.UseSqlServer(_sql!.GetConnectionString()));
        services.Configure<OutboxOptions>(o =>
        {
            o.BatchSize = 10;
            o.MaxAttempts = 3;
            o.PollIntervalSeconds = 1;
        });
        services.AddLogging();
        var provider = services.BuildServiceProvider();

        var processor = new OutboxProcessor(
            provider.GetRequiredService<IServiceScopeFactory>(),
            provider.GetRequiredService<IOptions<OutboxOptions>>(),
            NullLogger<OutboxProcessor>.Instance);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await processor.StartAsync(cts.Token);
        await Task.Delay(2500);
        await processor.StopAsync(CancellationToken.None);

        await using var verify = new I2PDbContext(options);
        var message = await verify.OutboxMessages.SingleAsync();
        message.Status.Should().Be(OutboxStatuses.Processed);
        _rabbit.Should().NotBeNull();
    }
}
