namespace Platform.I2P.Domain.Exceptions;

/// <summary>
/// Raised when a source record is missing required fields or cannot be mapped without fabrication (WP1b / N-01).
/// </summary>
public sealed class RecordMappingException : Exception
{
    public RecordMappingException(string message) : base(message)
    {
    }
}
