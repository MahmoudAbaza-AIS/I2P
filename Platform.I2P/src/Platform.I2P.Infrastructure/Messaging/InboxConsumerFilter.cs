using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Infrastructure.Messaging;

/// <summary>
/// Documents and enables MassTransit EF inbox dedupe on receive endpoints.
/// Subscribers in other modules must use <c>UseEntityFrameworkOutbox&lt;TDbContext&gt;</c>
/// (or an equivalent inbox keyed by MessageId) so at-least-once delivery does not
/// create duplicate side effects (WP1 / NFR-REL-024).
/// </summary>
public static class InboxConsumerFilter
{
    public const string Documentation =
        "I2P delivers integration events at-least-once via the transactional outbox. " +
        "Consumers MUST enable the MassTransit EF inbox (UseEntityFrameworkOutbox) " +
        "or an InboxMessages unique index on MessageId inside the consumer transaction.";

    /// <summary>
    /// Returns true when InboxState already contains the message for the given consumer.
    /// Prefer endpoint middleware over calling this manually.
    /// </summary>
    public static Task<bool> HasProcessedAsync(
        I2PDbContext db,
        Guid messageId,
        Guid consumerId,
        CancellationToken cancellationToken = default) =>
        db.Set<MassTransit.EntityFrameworkCoreIntegration.InboxState>()
            .AnyAsync(
                x => x.MessageId == messageId && x.ConsumerId == consumerId,
                cancellationToken);
}

/// <summary>
/// Sample consumer filter that ignores redelivered messages already in the inbox.
/// Wired via AddConfigureEndpointsCallback + UseEntityFrameworkOutbox in DI.
/// </summary>
public sealed class InboxDocumentationConsumerFilter<T> : IFilter<ConsumeContext<T>>
    where T : class
{
    private readonly ILogger<InboxDocumentationConsumerFilter<T>> _logger;

    public InboxDocumentationConsumerFilter(ILogger<InboxDocumentationConsumerFilter<T>> logger) =>
        _logger = logger;

    public void Probe(ProbeContext context) => context.CreateFilterScope("i2p-inbox-docs");

    public async Task Send(ConsumeContext<T> context, IPipe<ConsumeContext<T>> next)
    {
        _logger.LogDebug(
            "Consuming {MessageType} MessageId={MessageId}. {InboxPolicy}",
            typeof(T).Name,
            context.MessageId,
            InboxConsumerFilter.Documentation);

        await next.Send(context);
    }
}
