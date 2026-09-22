namespace Platform.I2P.Domain.ValueObjects;

/// <summary>
/// Quality indicator for operational values (FR-RTAG-051–054).
/// Propagated through every transformation; never dropped silently.
/// </summary>
public enum QualityCode
{
    Good = 0,
    Uncertain = 1,
    Bad = 2,
    Unknown = 3
}

public sealed class Quality : IEquatable<Quality>
{
    public QualityCode Code { get; }
    public string? Reason { get; }

    private Quality(QualityCode code, string? reason)
    {
        Code = code;
        Reason = reason;
    }

    public static Quality Good() => new(QualityCode.Good, null);
    public static Quality Uncertain(string? reason = null) => new(QualityCode.Uncertain, reason);
    public static Quality Bad(string? reason = null) => new(QualityCode.Bad, reason);
    public static Quality Unknown(string? reason = null) => new(QualityCode.Unknown, reason);

    public static Quality FromCode(QualityCode code, string? reason = null) =>
        code switch
        {
            QualityCode.Good => Good(),
            QualityCode.Uncertain => Uncertain(reason),
            QualityCode.Bad => Bad(reason),
            QualityCode.Unknown => Unknown(reason),
            _ => Unknown(reason)
        };

    public bool Equals(Quality? other) =>
        other is not null && Code == other.Code && Reason == other.Reason;

    public override bool Equals(object? obj) => obj is Quality other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(Code, Reason);

    public override string ToString() =>
        string.IsNullOrWhiteSpace(Reason) ? Code.ToString() : $"{Code}:{Reason}";
}
