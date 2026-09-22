namespace Platform.I2P.Domain.Exceptions;

public sealed class ForbiddenResourceException : Exception
{
    public string? ResourceId { get; }

    public ForbiddenResourceException(string message, string? resourceId = null)
        : base(message)
    {
        ResourceId = resourceId;
    }
}
