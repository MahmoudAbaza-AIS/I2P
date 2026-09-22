using System.Security.Claims;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Security;

public sealed class HttpCurrentUserContext : ICurrentUserContext
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public HttpCurrentUserContext(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    private ClaimsPrincipal User =>
        _httpContextAccessor.HttpContext?.User
        ?? throw new InvalidOperationException("No active HTTP context is available.");

    public bool IsAuthenticated => User.Identity?.IsAuthenticated == true;

    public string Subject =>
        User.FindFirstValue(I2PAuthPolicies.ClaimTypes.Subject)
        ?? User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Authenticated principal is missing a subject claim.");

    public string TenantId =>
        User.FindFirstValue(I2PAuthPolicies.ClaimTypes.TenantId)
        ?? throw new UnauthorizedAccessException("Authenticated principal is missing a tenant_id claim.");

    public bool IsInRole(string role) => User.IsInRole(role);
}
