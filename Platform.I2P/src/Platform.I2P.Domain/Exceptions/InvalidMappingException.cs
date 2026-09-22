namespace Platform.I2P.Domain.Exceptions;

public sealed class InvalidMappingException : Exception
{
    public string? MappingId { get; }

    public InvalidMappingException(string message, string? mappingId = null)
        : base(message)
    {
        MappingId = mappingId;
    }

    public InvalidMappingException(string message, string? mappingId, Exception innerException)
        : base(message, innerException)
    {
        MappingId = mappingId;
    }
}
