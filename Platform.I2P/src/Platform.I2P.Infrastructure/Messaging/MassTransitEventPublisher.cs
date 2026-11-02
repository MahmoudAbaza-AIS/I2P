using MassTransit;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;

namespace Platform.I2P.Infrastructure.Messaging;

/// <summary>
/// Stages publishes through MassTransit bus outbox (same DbContext transaction as business rows).
/// Caller must commit via <see cref="IUnitOfWork.SaveChangesAsync"/>.
/// </summary>
public sealed class MassTransitEventPublisher : IEventPublisher
{
    private readonly IPublishEndpoint _publishEndpoint;

    public MassTransitEventPublisher(IPublishEndpoint publishEndpoint) =>
        _publishEndpoint = publishEndpoint;

    public async Task PublishAsync<TEvent>(TEvent @event, CancellationToken cancellationToken = default)
        where TEvent : class
    {
        var typeName = typeof(TEvent).FullName
            ?? throw new InvalidOperationException("Event type must have a full name.");

        if (!OutboxTypeAllowList.IsAllowed(typeName))
        {
            throw new InvalidOperationException($"Event type '{typeName}' is not allowlisted for outbox publication.");
        }

        await _publishEndpoint.Publish(@event, context =>
        {
            if (@event is ErpDataReceivedEvent erp)
            {
                context.MessageId = erp.MessageId;
                context.CorrelationId = erp.CorrelationId;
            }
        }, cancellationToken);
    }
}

public static class OutboxTypeAllowList
{
    private static readonly HashSet<string> Allowed = new(StringComparer.Ordinal)
    {
        typeof(ErpDataReceivedEvent).FullName!,
        typeof(SyncFailedEvent).FullName!
    };

    public static bool IsAllowed(string typeName) => Allowed.Contains(typeName);
}
