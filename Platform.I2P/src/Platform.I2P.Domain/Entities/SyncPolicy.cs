namespace Platform.I2P.Domain.Entities;

public enum SyncMode
{
    Scheduled = 0,
    EventDriven = 1
}

/// <summary>
/// Scheduled vs event-driven synchronization configuration.
/// Retry counts and intervals are data-driven, not hardcoded per deployment.
/// </summary>
public sealed class SyncPolicy
{
    public Guid Id { get; private set; }
    public Guid EndpointId { get; private set; }
    public SyncMode Mode { get; private set; }
    public string? CronExpression { get; private set; }
    public int MaxRetryCount { get; private set; }
    public TimeSpan RetryBackoff { get; private set; }
    public TimeSpan RequestTimeout { get; private set; }
    public bool IsActive { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }

    private SyncPolicy()
    {
    }

    private SyncPolicy(
        Guid id,
        Guid endpointId,
        SyncMode mode,
        string? cronExpression,
        int maxRetryCount,
        TimeSpan retryBackoff,
        TimeSpan requestTimeout,
        bool isActive,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        EndpointId = endpointId;
        Mode = mode;
        CronExpression = cronExpression;
        MaxRetryCount = maxRetryCount;
        RetryBackoff = retryBackoff;
        RequestTimeout = requestTimeout;
        IsActive = isActive;
        CreatedAtUtc = createdAtUtc;
    }

    public static SyncPolicy Create(
        Guid endpointId,
        SyncMode mode,
        int maxRetryCount,
        TimeSpan retryBackoff,
        TimeSpan requestTimeout,
        string? cronExpression = null,
        Guid? id = null,
        DateTimeOffset? createdAtUtc = null)
    {
        if (endpointId == Guid.Empty)
        {
            throw new ArgumentException("Endpoint id is required.", nameof(endpointId));
        }

        if (maxRetryCount < 0)
        {
            throw new ArgumentOutOfRangeException(nameof(maxRetryCount), "Retry count cannot be negative.");
        }

        if (retryBackoff < TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(retryBackoff), "Backoff cannot be negative.");
        }

        if (requestTimeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(requestTimeout), "Timeout must be positive.");
        }

        if (mode == SyncMode.Scheduled && string.IsNullOrWhiteSpace(cronExpression))
        {
            throw new ArgumentException("Cron expression is required for scheduled sync.", nameof(cronExpression));
        }

        return new SyncPolicy(
            id ?? Guid.NewGuid(),
            endpointId,
            mode,
            string.IsNullOrWhiteSpace(cronExpression) ? null : cronExpression.Trim(),
            maxRetryCount,
            retryBackoff,
            requestTimeout,
            isActive: true,
            createdAtUtc ?? DateTimeOffset.UtcNow);
    }

    public void Deactivate() => IsActive = false;

    public void Activate() => IsActive = true;
}
