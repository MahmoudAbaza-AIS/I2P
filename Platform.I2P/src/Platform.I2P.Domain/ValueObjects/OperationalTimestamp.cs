namespace Platform.I2P.Domain.ValueObjects;

/// <summary>
/// Distinguishes source-provided timestamps from platform-generated ones (time sync NFR).
/// </summary>
public sealed class OperationalTimestamp : IEquatable<OperationalTimestamp>
{
    public DateTimeOffset Value { get; }
    public TimestampOrigin Origin { get; }

    private OperationalTimestamp(DateTimeOffset value, TimestampOrigin origin)
    {
        if (value == default)
        {
            throw new ArgumentException("Timestamp value cannot be default.", nameof(value));
        }

        Value = value.ToUniversalTime();
        Origin = origin;
    }

    public static OperationalTimestamp FromSource(DateTimeOffset value) =>
        new(value, TimestampOrigin.Source);

    public static OperationalTimestamp FromPlatform(DateTimeOffset? value = null) =>
        new(value ?? DateTimeOffset.UtcNow, TimestampOrigin.Platform);

    public bool Equals(OperationalTimestamp? other) =>
        other is not null && Value.Equals(other.Value) && Origin == other.Origin;

    public override bool Equals(object? obj) => obj is OperationalTimestamp other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(Value, Origin);

    public override string ToString() => $"{Value:O} ({Origin})";
}

public enum TimestampOrigin
{
    Source = 0,
    Platform = 1
}
