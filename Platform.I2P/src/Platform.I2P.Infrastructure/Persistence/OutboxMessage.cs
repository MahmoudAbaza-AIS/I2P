using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Infrastructure.Persistence;

public sealed class AuditRecord
{
    public Guid Id { get; set; }
    public string Action { get; set; } = string.Empty;
    public string Actor { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public DateTimeOffset CreatedAtUtc { get; set; }
}

public sealed class ExchangeRecordEntity
{
    public Guid Id { get; set; }
    public string TenantId { get; set; } = string.Empty;
    public Guid EndpointId { get; set; }
    public string ExternalId { get; set; } = string.Empty;
    public string PayloadHash { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public DateTimeOffset SourceTimestampUtc { get; set; }
    public string TimestampOrigin { get; set; } = string.Empty;
    public string QualityCode { get; set; } = string.Empty;
    public string? QualityReason { get; set; }
    public string SourceSystem { get; set; } = string.Empty;
    public string IdempotencyKey { get; set; } = string.Empty;
    public DateTimeOffset ReceivedAtUtc { get; set; }

    public static ExchangeRecordEntity FromDomain(ExchangeRecord record) => new()
    {
        Id = record.Id,
        TenantId = record.TenantId,
        EndpointId = record.EndpointId,
        ExternalId = record.ExternalId,
        PayloadHash = record.PayloadHash,
        PayloadJson = record.PayloadJson,
        SourceTimestampUtc = record.Timestamp.Value,
        TimestampOrigin = record.Timestamp.Origin.ToString(),
        QualityCode = record.Quality.Code.ToString(),
        QualityReason = record.Quality.Reason,
        SourceSystem = record.SourceSystem,
        IdempotencyKey = record.IdempotencyKey,
        ReceivedAtUtc = record.ReceivedAtUtc
    };

    public ExchangeRecord ToDomain()
    {
        var origin = Enum.Parse<TimestampOrigin>(TimestampOrigin);
        var timestamp = origin == Domain.ValueObjects.TimestampOrigin.Source
            ? OperationalTimestamp.FromSource(SourceTimestampUtc)
            : OperationalTimestamp.FromPlatform(SourceTimestampUtc);

        var quality = Quality.FromCode(Enum.Parse<QualityCode>(QualityCode), QualityReason);

        return ExchangeRecord.Create(
            TenantId,
            EndpointId,
            ExternalId,
            PayloadHash,
            PayloadJson,
            timestamp,
            quality,
            SourceSystem,
            Id,
            ReceivedAtUtc);
    }
}
