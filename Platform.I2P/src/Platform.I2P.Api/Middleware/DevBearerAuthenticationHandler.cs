using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using System.Security.Claims;
using System.Text.Encodings.Web;

namespace Platform.I2P.Api.Middleware;

/// <summary>
/// Development-only authentication. Always requires a configured shared secret (fail-closed).
/// </summary>
public sealed class DevBearerAuthenticationHandler
    : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public DevBearerAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : base(options, logger, encoder)
    {
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var configuration = Context.RequestServices.GetRequiredService<IConfiguration>();
        var environment = Context.RequestServices.GetRequiredService<IHostEnvironment>();

        if (!environment.IsDevelopment())
        {
            return Task.FromResult(AuthenticateResult.Fail("DevBearer is not permitted outside Development."));
        }

        var configured = configuration["Auth:DevBearerToken"];
        if (string.IsNullOrWhiteSpace(configured))
        {
            return Task.FromResult(AuthenticateResult.Fail(
                "Auth:DevBearerToken must be configured for Development authentication (fail-closed)."));
        }

        if (!Request.Headers.TryGetValue("Authorization", out var header) ||
            !header.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            return Task.FromResult(AuthenticateResult.Fail("Missing bearer token."));
        }

        var token = header.ToString()["Bearer ".Length..].Trim();
        if (!string.Equals(token, configured, StringComparison.Ordinal))
        {
            return Task.FromResult(AuthenticateResult.Fail("Invalid bearer token."));
        }

        var tenantId = configuration["Auth:DevTenantId"];
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            return Task.FromResult(AuthenticateResult.Fail("Auth:DevTenantId must be configured for Development."));
        }

        var roles = configuration.GetSection("Auth:DevRoles").Get<string[]>()
            ?? [I2PAuthPolicies.Roles.Admin, I2PAuthPolicies.Roles.Operator, I2PAuthPolicies.Roles.Reader];

        var identity = new ClaimsIdentity("DevBearer");
        identity.AddClaim(new Claim(I2PAuthPolicies.ClaimTypes.Subject, "dev-user"));
        identity.AddClaim(new Claim(I2PAuthPolicies.ClaimTypes.TenantId, tenantId));
        foreach (var role in roles.Where(r => !string.IsNullOrWhiteSpace(r)))
        {
            identity.AddClaim(new Claim(ClaimTypes.Role, role));
        }

        var principal = new ClaimsPrincipal(identity);
        return Task.FromResult(AuthenticateResult.Success(
            new AuthenticationTicket(principal, "DevBearer")));
    }
}
