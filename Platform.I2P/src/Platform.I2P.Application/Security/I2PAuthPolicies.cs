namespace Platform.I2P.Application.Security;

public static class I2PAuthPolicies
{
    public const string Reader = "Integration.Reader";
    public const string Operator = "Integration.Operator";
    public const string Admin = "Integration.Admin";

    public static class Roles
    {
        public const string Reader = "Integration.Reader";
        public const string Operator = "Integration.Operator";
        public const string Admin = "Integration.Admin";
    }

    public static class ClaimTypes
    {
        public const string TenantId = "tenant_id";
        public const string Subject = "sub";
    }
}

public interface ICurrentUserContext
{
    string Subject { get; }
    string TenantId { get; }
    bool IsAuthenticated { get; }
    bool IsInRole(string role);
}

public interface IAccessTokenProvider
{
    /// <summary>
    /// Returns a short-lived access token for the given secret reference.
    /// Never returns a hardcoded fallback; throws if the secret cannot be resolved.
    /// </summary>
    Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default);
}
