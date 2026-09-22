namespace Platform.I2P.Contracts.Events;

/// <summary>Published when ERP data is accepted after domain validation.</summary>
public sealed record ErpDataReceivedEvent(
    Guid ExchangeId,
    Guid EndpointId,
    string ExternalId,
    string PayloadJson,
    DateTimeOffset SourceTimestampUtc,
    string Quality,
    string SourceSystem,
    DateTimeOffset PublishedAtUtc);

/// <summary>Published when a sync attempt fails after retries.</summary>
public sealed record SyncFailedEvent(
    Guid EndpointId,
    string Connector,
    string Operation,
    string ErrorMessage,
    DateTimeOffset FailedAtUtc);
