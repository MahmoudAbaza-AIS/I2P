using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Domain.Entities;

/// <summary>
/// A single unit of exchanged data carrying source, timestamp, and quality (FR-RTAG-051–054).
/// </summary>
public sealed class ExchangeRecord
{
    public Guid Id { get; private set; }
    public string TenantId { get; private set; }
    public Guid EndpointId { get; private set; }
    public string ExternalId { get; private set; }
    public string PayloadHash { get; private set; }
    public string PayloadJson { get; private set; }
    public OperationalTimestamp Timestamp { get; private set; }
    public Quality Quality { get; private set; }
    public string SourceSystem { get; private set; }
    public DateTimeOffset ReceivedAtUtc { get; private set; }

    private ExchangeRecord(
        Guid id,
        string tenantId,
        Guid endpointId,
        string externalId,
        string payloadHash,
        string payloadJson,
        OperationalTimestamp timestamp,
        Quality quality,
        string sourceSystem,
        DateTimeOffset receivedAtUtc)
    {
        Id = id;
        TenantId = tenantId;
        EndpointId = endpointId;
        ExternalId = externalId;
        PayloadHash = payloadHash;
        PayloadJson = payloadJson;
        Timestamp = timestamp;
        Quality = quality;
        SourceSystem = sourceSystem;
        ReceivedAtUtc = receivedAtUtc;
    }

    public static ExchangeRecord Create(
        string tenantId,
        Guid endpointId,
        string externalId,
        string payloadHash,
        string payloadJson,
        OperationalTimestamp timestamp,
        Quality quality,
        string sourceSystem,
        Guid? id = null,
        DateTimeOffset? receivedAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        }

        if (endpointId == Guid.Empty)
        {
            throw new ArgumentException("Endpoint id is required.", nameof(endpointId));
        }

        if (string.IsNullOrWhiteSpace(externalId))
        {
            throw new ArgumentException("External id is required.", nameof(externalId));
        }

        if (string.IsNullOrWhiteSpace(payloadHash))
        {
            throw new ArgumentException("Payload hash is required.", nameof(payloadHash));
        }

        if (string.IsNullOrWhiteSpace(payloadJson))
        {
            throw new ArgumentException("Payload is required.", nameof(payloadJson));
        }

        ArgumentNullException.ThrowIfNull(timestamp);
        ArgumentNullException.ThrowIfNull(quality);

        if (string.IsNullOrWhiteSpace(sourceSystem))
        {
            throw new ArgumentException("Source system is required.", nameof(sourceSystem));
        }

        return new ExchangeRecord(
            id ?? Guid.NewGuid(),
            tenantId.Trim(),
            endpointId,
            externalId.Trim(),
            payloadHash.Trim(),
            payloadJson,
            timestamp,
            quality,
            sourceSystem.Trim(),
            receivedAtUtc ?? DateTimeOffset.UtcNow);
    }

    public bool BelongsToTenant(string tenantId) =>
        string.Equals(TenantId, tenantId, StringComparison.Ordinal);

    public string IdempotencyKey => $"{TenantId}:{EndpointId:N}:{ExternalId}:{PayloadHash}";
}
