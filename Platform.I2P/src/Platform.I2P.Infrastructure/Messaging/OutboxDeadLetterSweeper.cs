using System.Diagnostics;
using MassTransit;
using MassTransit.EntityFrameworkCoreIntegration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Infrastructure.Observability;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Infrastructure.Messaging;

/// <summary>
/// Moves undelivered bus-outbox rows that exceed delivery age into the admin dead-letter store (WP1 #6).
/// MassTransit bus outbox retries with QueryDelay; this sweeper enforces a finite dead-letter bound.
/// </summary>
public sealed class OutboxDeadLetterSweeper : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IOptions<OutboxDeliveryOptions> _options;
    private readonly IOptions<MessagingOptions> _messaging;
    private readonly ILogger<OutboxDeadLetterSweeper> _logger;

    public OutboxDeadLetterSweeper(
        IServiceScopeFactory scopeFactory,
        IOptions<OutboxDeliveryOptions> options,
        IOptions<MessagingOptions> messaging,
        ILogger<OutboxDeadLetterSweeper> logger)
    {
        _scopeFactory = scopeFactory;
        _options = options;
        _messaging = messaging;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // No broker in Development: do not dead-letter rows that are intentionally held pending (D-02).
        if (!_messaging.Value.IsConfigured)
        {
            _logger.LogInformation(
                "Outbox dead-letter sweeper idle: RabbitMQ not configured; rows stay pending.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SweepAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Outbox dead-letter sweep failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(_options.Value.SweepIntervalSeconds), stoppingToken);
        }
    }

    private async Task SweepAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<I2PDbContext>();
        var deadLetters = scope.ServiceProvider.GetRequiredService<IDeadLetterOutboxService>();
        var publisher = scope.ServiceProvider.GetRequiredService<IPublishEndpoint>();
        var audit = scope.ServiceProvider.GetRequiredService<IAuditWriter>();
        var uow = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();
        var metrics = scope.ServiceProvider.GetRequiredService<OutboxMetrics>();

        var cutoff = DateTime.UtcNow.AddSeconds(-_options.Value.DeadLetterAgeSeconds);
        var maxAttempts = Math.Max(1, _options.Value.MaxAttempts);

        var candidates = await db.Set<OutboxMessage>()
            .Where(x => x.OutboxId != null && x.SentTime < cutoff)
            .OrderBy(x => x.SequenceNumber)
            .Take(50)
            .ToListAsync(cancellationToken);

        foreach (var message in candidates)
        {
            var sw = Stopwatch.StartNew();

            deadLetters.Stage(
                message.MessageType,
                message.Body,
                $"Delivery not confirmed within {_options.Value.DeadLetterAgeSeconds}s (MaxAttempts={maxAttempts}).",
                maxAttempts);

            db.Set<OutboxMessage>().Remove(message);

            await publisher.Publish(
                new SyncFailedEvent(
                    Guid.Empty,
                    "OutboxDelivery",
                    "DeadLetter",
                    $"Outbox MessageId={message.MessageId} dead-lettered after delivery timeout.",
                    DateTimeOffset.UtcNow),
                cancellationToken);

            await audit.WriteAsync(
                "OutboxDeadLettered",
                "system",
                $"MessageId={message.MessageId} SequenceNumber={message.SequenceNumber}",
                cancellationToken);

            await uow.SaveChangesAsync(cancellationToken);
            metrics.PublishDurationMs.Record(sw.Elapsed.TotalMilliseconds);

            _logger.LogError(
                "Outbox message {MessageId} dead-lettered after delivery timeout",
                message.MessageId);
        }
    }
}
