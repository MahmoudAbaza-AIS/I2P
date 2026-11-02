using System.Diagnostics.Metrics;

namespace Platform.I2P.Infrastructure.Observability;

/// <summary>OpenTelemetry metrics for outbox delivery (FR-API-065).</summary>
public sealed class OutboxMetrics
{
    public const string MeterName = "Platform.I2P.Outbox";

    private readonly Meter _meter;
    private long _pending;
    private double _oldestPendingAgeSeconds;

    public OutboxMetrics()
    {
        _meter = new Meter(MeterName, "1.0.0");
        DeadLetteredTotal = _meter.CreateCounter<long>("i2p_outbox_deadlettered_total");
        PublishDurationMs = _meter.CreateHistogram<double>("i2p_outbox_publish_duration_ms");

        _meter.CreateObservableGauge(
            "i2p_outbox_pending",
            () => Volatile.Read(ref _pending));

        _meter.CreateObservableGauge(
            "i2p_outbox_oldest_pending_age_seconds",
            () => Volatile.Read(ref _oldestPendingAgeSeconds));
    }

    public Counter<long> DeadLetteredTotal { get; }
    public Histogram<double> PublishDurationMs { get; }

    public void SetPendingSnapshot(long pending, double oldestAgeSeconds)
    {
        Volatile.Write(ref _pending, pending);
        Volatile.Write(ref _oldestPendingAgeSeconds, oldestAgeSeconds);
    }
}
