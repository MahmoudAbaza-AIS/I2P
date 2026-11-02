namespace Platform.I2P.Contracts.Dtos;

/// <summary>Versioned purchase order shape for cross-module consumption (FR-API-007/076).</summary>
public sealed record PurchaseOrderDto(
    string ExternalId,
    string Number,
    string Vendor,
    decimal Amount,
    string Currency,
    DateTimeOffset SourceTimestampUtc,
    string TimestampOrigin,
    string Quality,
    string SourceSystem);

/// <summary>ERP sync outcome: accepted records vs per-record mapping rejections (WP1b).</summary>
public sealed record SyncErpPurchaseOrderResultDto(
    IReadOnlyList<PurchaseOrderDto> Accepted,
    IReadOnlyList<string> RejectedReasons);

/// <summary>Per-connector health snapshot for platform diagnostics.</summary>
public sealed record IntegrationHealthDto(
    string Connector,
    bool IsHealthy,
    string Status,
    DateTimeOffset CheckedAtUtc,
    string? Detail = null);

public sealed record ExchangeHistoryItemDto(
    Guid Id,
    Guid EndpointId,
    string ExternalId,
    string SourceSystem,
    string Quality,
    DateTimeOffset SourceTimestampUtc,
    DateTimeOffset ReceivedAtUtc);

public sealed record PagedResultDto<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);
