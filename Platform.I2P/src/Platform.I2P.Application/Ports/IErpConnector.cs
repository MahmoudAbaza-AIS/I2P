using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.Exceptions;
using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Application.Ports;

/// <summary>Accepted records plus per-record rejection reasons (no silent fabrication).</summary>
public sealed record ConnectorBatchResult<T>(
    IReadOnlyList<T> Accepted,
    IReadOnlyList<string> RejectedReasons);

public static class ConnectorBatchMapper
{
    public static ConnectorBatchResult<TOut> MapAll<TIn, TOut>(
        IEnumerable<TIn> sources,
        Func<TIn, TOut> map)
    {
        var accepted = new List<TOut>();
        var rejected = new List<string>();
        foreach (var src in sources)
        {
            try
            {
                accepted.Add(map(src));
            }
            catch (RecordMappingException ex)
            {
                rejected.Add(ex.Message);
            }
        }

        return new ConnectorBatchResult<TOut>(accepted, rejected);
    }
}

public interface IErpConnector
{
    string ConnectorName { get; }
    Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<ConnectorBatchResult<PurchaseOrderData>> GetPurchaseOrdersAsync(
        Guid endpointId,
        string? purchaseOrderNumber = null,
        CancellationToken cancellationToken = default);
}

public interface IMesConnector
{
    string ConnectorName { get; }
    Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<ConnectorBatchResult<MesWorkOrderData>> GetWorkOrdersAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default);
}

public interface ICmmsConnector
{
    string ConnectorName { get; }
    Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<ConnectorBatchResult<CmmsWorkOrderData>> GetWorkOrdersAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default);
}

public interface IGisConnector
{
    string ConnectorName { get; }
    Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<ConnectorBatchResult<GisFeatureData>> GetFeaturesAsync(
        Guid endpointId,
        string layerName,
        CancellationToken cancellationToken = default);
}

public interface ILimsConnector
{
    string ConnectorName { get; }
    Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default);
    Task<ConnectorBatchResult<LimsSampleData>> GetSamplesAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default);
}

public interface IEventPublisher
{
    /// <summary>
    /// Stages an integration event for transactional outbox delivery.
    /// Does not commit; caller must <see cref="IUnitOfWork.SaveChangesAsync"/>.
    /// </summary>
    Task PublishAsync<TEvent>(TEvent @event, CancellationToken cancellationToken = default)
        where TEvent : class;
}

/// <summary>Commits the ambient EF change tracker (business rows + MassTransit outbox).</summary>
public interface IUnitOfWork
{
    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}

public interface ISecretsProvider
{
    Task<string?> GetSecretAsync(string secretReference, CancellationToken cancellationToken = default);
}

public interface IIntegrationEndpointRepository
{
    Task<IntegrationEndpoint?> GetByIdForTenantAsync(Guid id, string tenantId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<IntegrationEndpoint>> GetAllForTenantAsync(string tenantId, CancellationToken cancellationToken = default);
    Task AddAsync(IntegrationEndpoint endpoint, CancellationToken cancellationToken = default);
}

public interface IFieldMappingRepository
{
    Task<FieldMapping?> GetByIdForTenantAsync(Guid id, string tenantId, CancellationToken cancellationToken = default);
    Task AddAsync(FieldMapping mapping, CancellationToken cancellationToken = default);
    Task UpdateAsync(FieldMapping mapping, CancellationToken cancellationToken = default);
}

public interface IExchangeRecordRepository
{
    Task<bool> ExistsByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default);
    Task AddAsync(ExchangeRecord record, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<ExchangeRecord>> GetPagedForTenantAsync(string tenantId, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<int> CountForTenantAsync(string tenantId, CancellationToken cancellationToken = default);
}

public interface IAuditWriter
{
    Task WriteAsync(string action, string actor, string details, CancellationToken cancellationToken = default);
}

public sealed record ConnectorHealth(bool IsHealthy, string Status, string? Detail = null);

public sealed record PurchaseOrderData(
    string ExternalId,
    string Number,
    string Vendor,
    decimal Amount,
    string Currency,
    OperationalTimestamp Timestamp,
    Quality Quality);

public sealed record MesWorkOrderData(
    string ExternalId,
    string OrderNumber,
    string Status,
    OperationalTimestamp Timestamp,
    Quality Quality);

public sealed record CmmsWorkOrderData(
    string ExternalId,
    string WorkOrderNumber,
    string AssetId,
    OperationalTimestamp Timestamp,
    Quality Quality);

public sealed record GisFeatureData(
    string ExternalId,
    string LayerName,
    string GeometryJson,
    OperationalTimestamp Timestamp,
    Quality Quality);

public sealed record LimsSampleData(
    string ExternalId,
    string SampleId,
    string Analyte,
    string Result,
    OperationalTimestamp Timestamp,
    Quality Quality);
