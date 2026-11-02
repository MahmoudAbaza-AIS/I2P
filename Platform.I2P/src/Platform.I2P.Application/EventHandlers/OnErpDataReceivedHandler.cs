using MediatR;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.Rules;
using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Application.EventHandlers;

/// <summary>
/// Notification raised by connectors when raw ERP payloads arrive (inbound event path).
/// </summary>
public sealed record ErpRawDataReceivedNotification(
    string TenantId,
    Guid EndpointId,
    string ExternalId,
    string PayloadJson,
    DateTimeOffset? SourceTimestampUtc,
    string? QualityCode) : INotification;

public sealed class OnErpDataReceivedHandler : INotificationHandler<ErpRawDataReceivedNotification>
{
    private readonly IExchangeRecordRepository _exchanges;
    private readonly IEventPublisher _publisher;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<OnErpDataReceivedHandler> _logger;

    public OnErpDataReceivedHandler(
        IExchangeRecordRepository exchanges,
        IEventPublisher publisher,
        IUnitOfWork unitOfWork,
        ILogger<OnErpDataReceivedHandler> logger)
    {
        _exchanges = exchanges;
        _publisher = publisher;
        _unitOfWork = unitOfWork;
        _logger = logger;
    }

    public async Task Handle(ErpRawDataReceivedNotification notification, CancellationToken cancellationToken)
    {
        var payloadHash = Convert.ToHexString(
            System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(notification.PayloadJson)));

        var quality = ParseQuality(notification.QualityCode);
        var timestamp = notification.SourceTimestampUtc is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(notification.SourceTimestampUtc.Value);

        var exchange = ExchangeRecord.Create(
            notification.TenantId,
            notification.EndpointId,
            notification.ExternalId,
            payloadHash,
            notification.PayloadJson,
            timestamp,
            quality,
            "SAP");

        if (await _exchanges.ExistsByIdempotencyKeyAsync(exchange.IdempotencyKey, cancellationToken))
        {
            _logger.LogInformation("Duplicate ERP payload ignored for {ExternalId}", notification.ExternalId);
            return;
        }

        if (IdempotencyChecker.IsDuplicate(exchange.IdempotencyKey, Array.Empty<string>()))
        {
            return;
        }

        await _exchanges.AddAsync(exchange, cancellationToken);

        var messageId = Guid.NewGuid();
        await _publisher.PublishAsync(
            new ErpDataReceivedEvent(
                messageId,
                CorrelationId: Guid.NewGuid(),
                exchange.Id,
                exchange.EndpointId,
                exchange.ExternalId,
                EntityType: "PurchaseOrder",
                SequenceNumber: DateTimeOffset.UtcNow.Ticks,
                exchange.PayloadJson,
                exchange.Timestamp.Value,
                exchange.Quality.Code.ToString(),
                exchange.SourceSystem,
                DateTimeOffset.UtcNow),
            cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static Quality ParseQuality(string? code) =>
        Enum.TryParse<QualityCode>(code, ignoreCase: true, out var parsed)
            ? Quality.FromCode(parsed)
            : Quality.Unknown("Missing quality from source");
}
