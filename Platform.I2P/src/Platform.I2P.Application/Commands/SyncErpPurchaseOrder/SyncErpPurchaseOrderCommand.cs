using System.Text.Json;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Contracts.Dtos;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.Exceptions;
using Platform.I2P.Domain.Rules;

namespace Platform.I2P.Application.Commands.SyncErpPurchaseOrder;

public sealed record SyncErpPurchaseOrderCommand(Guid EndpointId, string? PurchaseOrderNumber = null)
    : IRequest<IReadOnlyList<PurchaseOrderDto>>;

public sealed class SyncErpPurchaseOrderValidator : AbstractValidator<SyncErpPurchaseOrderCommand>
{
    public SyncErpPurchaseOrderValidator()
    {
        RuleFor(x => x.EndpointId).NotEmpty();
    }
}

public sealed class SyncErpPurchaseOrderHandler
    : IRequestHandler<SyncErpPurchaseOrderCommand, IReadOnlyList<PurchaseOrderDto>>
{
    private readonly IErpConnector _erpConnector;
    private readonly IIntegrationEndpointRepository _endpoints;
    private readonly IExchangeRecordRepository _exchanges;
    private readonly IEventPublisher _publisher;
    private readonly IAuditWriter _auditWriter;
    private readonly ICurrentUserContext _user;
    private readonly ILogger<SyncErpPurchaseOrderHandler> _logger;

    public SyncErpPurchaseOrderHandler(
        IErpConnector erpConnector,
        IIntegrationEndpointRepository endpoints,
        IExchangeRecordRepository exchanges,
        IEventPublisher publisher,
        IAuditWriter auditWriter,
        ICurrentUserContext user,
        ILogger<SyncErpPurchaseOrderHandler> logger)
    {
        _erpConnector = erpConnector;
        _endpoints = endpoints;
        _exchanges = exchanges;
        _publisher = publisher;
        _auditWriter = auditWriter;
        _user = user;
        _logger = logger;
    }

    public async Task<IReadOnlyList<PurchaseOrderDto>> Handle(
        SyncErpPurchaseOrderCommand request,
        CancellationToken cancellationToken)
    {
        var endpoint = await _endpoints.GetByIdForTenantAsync(request.EndpointId, _user.TenantId, cancellationToken);
        if (endpoint is null)
        {
            throw new ForbiddenResourceException(
                $"Endpoint '{request.EndpointId}' was not found for the caller's tenant.",
                request.EndpointId.ToString());
        }

        if (!endpoint.IsEnabled)
        {
            throw new InvalidOperationException($"Endpoint '{endpoint.Name}' is disabled.");
        }

        await _auditWriter.WriteAsync(
            "ManualSyncTriggered",
            _user.Subject,
            $"ERP sync for endpoint {endpoint.Id} tenant {endpoint.TenantId}",
            cancellationToken);

        var purchaseOrders = await _erpConnector.GetPurchaseOrdersAsync(
            request.EndpointId,
            request.PurchaseOrderNumber,
            cancellationToken);

        var results = new List<PurchaseOrderDto>();

        foreach (var po in purchaseOrders)
        {
            var payloadJson = JsonSerializer.Serialize(po);
            var payloadHash = Convert.ToHexString(
                System.Security.Cryptography.SHA256.HashData(
                    System.Text.Encoding.UTF8.GetBytes(payloadJson)));

            var exchange = ExchangeRecord.Create(
                endpoint.TenantId,
                endpoint.Id,
                po.ExternalId,
                payloadHash,
                payloadJson,
                po.Timestamp,
                po.Quality,
                _erpConnector.ConnectorName);

            if (await _exchanges.ExistsByIdempotencyKeyAsync(exchange.IdempotencyKey, cancellationToken))
            {
                _logger.LogInformation(
                    "Skipping duplicate ERP exchange {ExternalId} for endpoint {EndpointId}",
                    po.ExternalId,
                    endpoint.Id);
                continue;
            }

            if (IdempotencyChecker.IsDuplicate(exchange.IdempotencyKey, Array.Empty<string>()))
            {
                continue;
            }

            await _exchanges.AddAsync(exchange, cancellationToken);

            await _publisher.PublishAsync(
                new ErpDataReceivedEvent(
                    exchange.Id,
                    endpoint.Id,
                    exchange.ExternalId,
                    exchange.PayloadJson,
                    exchange.Timestamp.Value,
                    exchange.Quality.Code.ToString(),
                    exchange.SourceSystem,
                    DateTimeOffset.UtcNow),
                cancellationToken);

            results.Add(new PurchaseOrderDto(
                po.ExternalId,
                po.Number,
                po.Vendor,
                po.Amount,
                po.Currency,
                po.Timestamp.Value,
                po.Quality.Code.ToString(),
                _erpConnector.ConnectorName));
        }

        return results;
    }
}
