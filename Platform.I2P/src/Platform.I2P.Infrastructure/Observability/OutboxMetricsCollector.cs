using MassTransit.EntityFrameworkCoreIntegration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Infrastructure.Observability;

/// <summary>Periodically samples pending MassTransit outbox rows into OTel gauges.</summary>
public sealed class OutboxMetricsCollector : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly OutboxMetrics _metrics;
    private readonly ILogger<OutboxMetricsCollector> _logger;

    public OutboxMetricsCollector(
        IServiceScopeFactory scopeFactory,
        OutboxMetrics metrics,
        ILogger<OutboxMetricsCollector> logger)
    {
        _scopeFactory = scopeFactory;
        _metrics = metrics;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SampleAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning(ex, "Outbox metrics sample failed");
            }

            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }
    }

    private async Task SampleAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<I2PDbContext>();

        var pending = await db.Set<OutboxMessage>()
            .AsNoTracking()
            .Where(x => x.OutboxId != null)
            .CountAsync(cancellationToken);

        var oldest = await db.Set<OutboxMessage>()
            .AsNoTracking()
            .Where(x => x.OutboxId != null)
            .OrderBy(x => x.SequenceNumber)
            .Select(x => (DateTime?)x.SentTime)
            .FirstOrDefaultAsync(cancellationToken);

        var age = oldest is null
            ? 0d
            : Math.Max(0, (DateTime.UtcNow - DateTime.SpecifyKind(oldest.Value, DateTimeKind.Utc)).TotalSeconds);

        _metrics.SetPendingSnapshot(pending, age);
    }
}
