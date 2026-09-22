using Platform.I2P.Domain.Entities;

namespace Platform.I2P.Domain.Rules;

/// <summary>
/// Pure idempotency check for acquisition/sync/messaging (FR-COM-046, FR-RTD-020, FR-EDG-036).
/// </summary>
public static class IdempotencyChecker
{
    public static bool IsDuplicate(ExchangeRecord incoming, IEnumerable<ExchangeRecord> existingRecords)
    {
        ArgumentNullException.ThrowIfNull(incoming);
        ArgumentNullException.ThrowIfNull(existingRecords);

        var key = incoming.IdempotencyKey;
        return existingRecords.Any(existing =>
            string.Equals(existing.IdempotencyKey, key, StringComparison.Ordinal));
    }

    public static bool IsDuplicate(string idempotencyKey, IEnumerable<string> knownKeys)
    {
        if (string.IsNullOrWhiteSpace(idempotencyKey))
        {
            throw new ArgumentException("Idempotency key is required.", nameof(idempotencyKey));
        }

        ArgumentNullException.ThrowIfNull(knownKeys);

        return knownKeys.Any(known =>
            string.Equals(known, idempotencyKey, StringComparison.Ordinal));
    }
}
