using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Infrastructure.Messaging;

public sealed class MassTransitEventPublisher : IEventPublisher
{
    private readonly I2PDbContext _db;

    public MassTransitEventPublisher(I2PDbContext db) => _db = db;

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken cancellationToken = default)
        where TEvent : class
    {
        var typeName = typeof(TEvent).FullName
            ?? throw new InvalidOperationException("Event type must have a full name.");

        if (!OutboxTypeAllowList.IsAllowed(typeName))
        {
            throw new InvalidOperationException($"Event type '{typeName}' is not allowlisted for outbox publication.");
        }

        _db.OutboxMessages.Add(new OutboxMessage
        {
            Id = Guid.NewGuid(),
            TypeName = typeName,
            PayloadJson = JsonSerializer.Serialize(@event),
            CreatedAtUtc = DateTimeOffset.UtcNow,
            Status = OutboxStatuses.Pending
        });

        await _db.SaveChangesAsync(cancellationToken);
    }
}

public static class OutboxTypeAllowList
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        typeof(ErpDataReceivedEvent).FullName!,
        typeof(SyncFailedEvent).FullName!
    };

    public static bool IsAllowed(string typeName) => Allowed.Contains(typeName);

    public static Type? Resolve(string typeName) =>
        typeName switch
        {
            _ when typeName == typeof(ErpDataReceivedEvent).FullName => typeof(ErpDataReceivedEvent),
            _ when typeName == typeof(SyncFailedEvent).FullName => typeof(SyncFailedEvent),
            _ => null
        };
}

public sealed class OutboxOptions
{
    public int BatchSize { get; set; } = 50;
    public int MaxAttempts { get; set; } = 5;
    public int PollIntervalSeconds { get; set; } = 2;
}

public sealed class OutboxProcessor : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptions<OutboxOptions> _options;
    private readonly ILogger<OutboxProcessor> _logger;

    public OutboxProcessor(
        IServiceScopeFactory scopeFactory,
        IOptions<OutboxOptions> options,
        ILogger<OutboxProcessor> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessBatchAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Outbox processing failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.Value.PollIntervalSeconds), stoppingToken);
        }
    }

    private async Task ProcessBatchAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<I2PDbContext>();
        var publishEndpoint = scope.ServiceProvider.GetService<MassTransit.IPublishEndpoint>();

        var batch = await db.OutboxMessages
            .Where(x => x.Status == OutboxStatuses.Pending)
            .OrderBy(x => x.CreatedAtUtc)
            .Take(_options.Value.BatchSize)
            .ToListAsync(cancellationToken);

        foreach (var message in batch)
        {
            try
            {
                var type = OutboxTypeAllowList.Resolve(message.TypeName);
                if (type is null)
                {
                    throw new InvalidOperationException($"Outbox type '{message.TypeName}' is not allowlisted.");
                }

                var payload = JsonSerializer.Deserialize(message.PayloadJson, type)
                    ?? throw new InvalidOperationException("Outbox payload deserialized to null.");

                if (publishEndpoint is not null)
                {
                    await publishEndpoint.Publish(payload, type, cancellationToken);
                }
                else
                {
                    _logger.LogInformation(
                        "Outbox published locally (no bus) {Type} MessageId={MessageId}",
                        message.TypeName,
                        message.Id);
                }

                message.Status = OutboxStatuses.Processed;
                message.ProcessedAtUtc = DateTimeOffset.UtcNow;
                message.LastError = null;
            }
            catch (Exception ex)
            {
                message.AttemptCount++;
                message.LastError = ex.Message;
                if (message.AttemptCount >= _options.Value.MaxAttempts)
                {
                    message.Status = OutboxStatuses.DeadLettered;
                    _logger.LogError(ex, "Outbox message {Id} dead-lettered", message.Id);
                }
            }
        }

        if (batch.Count > 0)
        {
            await db.SaveChangesAsync(cancellationToken);
        }
    }
}
