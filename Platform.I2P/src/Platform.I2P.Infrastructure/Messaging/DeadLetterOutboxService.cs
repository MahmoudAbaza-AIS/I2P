using System.Text.Json;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Events;
using Platform.I2P.Infrastructure.Observability;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Infrastructure.Messaging;

public interface IDeadLetterOutboxService
{
    Task<IReadOnlyList<DeadLetterOutboxEntry>> ListAsync(CancellationToken cancellationToken = default);
    Task RequeueAsync(Guid deadLetterId, string actor, CancellationToken cancellationToken = default);
    /// <summary>Stages a dead-letter row; caller must <see cref="IUnitOfWork.SaveChangesAsync"/>.</summary>
    void Stage(string messageType, string payloadJson, string error, int attemptCount);
}

public sealed class DeadLetterOutboxService : IDeadLetterOutboxService
{
    private readonly I2PDbContext _db;
    private readonly IPublishEndpoint _publishEndpoint;
    private readonly IAuditWriter _audit;
    private readonly IUnitOfWork _uow;
    private readonly OutboxMetrics _metrics;

    public DeadLetterOutboxService(
        I2PDbContext db,
        IPublishEndpoint publishEndpoint,
        IAuditWriter audit,
        IUnitOfWork uow,
        OutboxMetrics metrics)
    {
        _db = db;
        _publishEndpoint = publishEndpoint;
        _audit = audit;
        _uow = uow;
        _metrics = metrics;
    }

    public async Task<IReadOnlyList<DeadLetterOutboxEntry>> ListAsync(CancellationToken cancellationToken = default) =>
        await _db.DeadLetterOutboxEntries.AsNoTracking()
            .Where(x => x.Status == DeadLetterStatuses.DeadLettered)
            .OrderByDescending(x => x.FailedAtUtc)
            .Take(500)
            .ToListAsync(cancellationToken);

    public async Task RequeueAsync(Guid deadLetterId, string actor, CancellationToken cancellationToken = default)
    {
        var entry = await _db.DeadLetterOutboxEntries
            .FirstOrDefaultAsync(x => x.Id == deadLetterId, cancellationToken)
            ?? throw new InvalidOperationException($"Dead-letter '{deadLetterId}' was not found.");

        if (entry.Status != DeadLetterStatuses.DeadLettered)
        {
            throw new InvalidOperationException($"Dead-letter '{deadLetterId}' is not requeueable (status={entry.Status}).");
        }

        var messageJson = ExtractMessageJson(entry.PayloadJson);

        if (entry.MessageType.Contains(nameof(ErpDataReceivedEvent), StringComparison.Ordinal) ||
            entry.MessageType == typeof(ErpDataReceivedEvent).FullName ||
            entry.MessageType.Contains("ErpDataReceivedEvent", StringComparison.Ordinal))
        {
            var evt = JsonSerializer.Deserialize<ErpDataReceivedEvent>(messageJson)
                ?? throw new InvalidOperationException("Dead-letter payload could not be deserialized as ErpDataReceivedEvent.");
            await _publishEndpoint.Publish(evt, ctx =>
            {
                ctx.MessageId = evt.MessageId;
                ctx.CorrelationId = evt.CorrelationId;
            }, cancellationToken);
        }
        else if (entry.MessageType.Contains(nameof(SyncFailedEvent), StringComparison.Ordinal) ||
                 entry.MessageType == typeof(SyncFailedEvent).FullName)
        {
            var evt = JsonSerializer.Deserialize<SyncFailedEvent>(messageJson)
                ?? throw new InvalidOperationException("Dead-letter payload could not be deserialized.");
            await _publishEndpoint.Publish(evt, cancellationToken);
        }
        else
        {
            throw new InvalidOperationException($"Cannot requeue allowlisted type '{entry.MessageType}'.");
        }

        entry.Status = DeadLetterStatuses.Requeued;
        entry.RequeuedAtUtc = DateTimeOffset.UtcNow;

        await _audit.WriteAsync(
            "OutboxDeadLetterRequeued",
            actor,
            $"Requeued dead-letter {entry.Id}",
            cancellationToken);

        await _uow.SaveChangesAsync(cancellationToken);
    }

    public void Stage(string messageType, string payloadJson, string error, int attemptCount)
    {
        _db.DeadLetterOutboxEntries.Add(new DeadLetterOutboxEntry
        {
            Id = Guid.NewGuid(),
            MessageType = messageType,
            PayloadJson = payloadJson,
            LastError = error.Length > 4000 ? error[..4000] : error,
            AttemptCount = attemptCount,
            FailedAtUtc = DateTimeOffset.UtcNow,
            Status = DeadLetterStatuses.DeadLettered
        });

        _metrics.DeadLetteredTotal.Add(1);
    }

    /// <summary>
    /// MassTransit outbox Body is an envelope with a nested <c>message</c>; admin/tests may store plain JSON.
    /// </summary>
    private static string ExtractMessageJson(string payload)
    {
        using var doc = JsonDocument.Parse(payload);
        if (doc.RootElement.ValueKind == JsonValueKind.Object &&
            doc.RootElement.TryGetProperty("message", out var message))
        {
            return message.GetRawText();
        }

        return payload;
    }
}
