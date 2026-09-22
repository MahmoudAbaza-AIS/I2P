using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;
using Platform.I2P.Application.Security;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Api.Tests;

/// <summary>
/// Negative-path coverage for authn/authz (PR Code Standards Checklist §2 / §3).
/// </summary>
public sealed class SecurityNegativePathTests : IClassFixture<DevBearerApiFactory>
{
    private readonly DevBearerApiFactory _factory;

    public SecurityNegativePathTests(DevBearerApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Missing_Bearer_Token_Returns_401()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/api/integration/sync/exchanges");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Tampered_Or_Wrong_Bearer_Token_Returns_401()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "not-the-dev-secret");
        var response = await client.GetAsync("/api/integration/sync/exchanges");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Wrong_Role_Reader_Cannot_Trigger_Operator_Sync()
    {
        await using var readerFactory = DevBearerApiFactory.WithRoles(I2PAuthPolicies.Roles.Reader);
        var client = readerFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", DevBearerApiFactory.DevToken);

        var response = await client.PostAsync(
            "/api/integration/sync/erp/purchase-orders",
            new StringContent("""{"endpointId":"11111111-1111-1111-1111-111111111111"}""", Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Health_Live_Is_Anonymous()
    {
        var client = _factory.CreateClient();
        var response = await client.GetAsync("/health/live");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }
}

public sealed class JwtSecurityNegativePathTests : IClassFixture<JwtApiFactory>
{
    private readonly JwtApiFactory _factory;

    public JwtSecurityNegativePathTests(JwtApiFactory factory) => _factory = factory;

    [Fact]
    public async Task Expired_Jwt_Returns_401()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", _factory.CreateToken(expiresIn: TimeSpan.FromMinutes(-5)));

        var response = await client.GetAsync("/api/integration/sync/exchanges");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Tampered_Jwt_Signature_Returns_401()
    {
        var client = _factory.CreateClient();
        var token = _factory.CreateToken(expiresIn: TimeSpan.FromMinutes(5));
        var parts = token.Split('.');
        parts[2] = new string('A', Math.Max(parts[2].Length, 16));
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", string.Join('.', parts));

        var response = await client.GetAsync("/api/integration/sync/exchanges");
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}

public class DevBearerApiFactory : WebApplicationFactory<Program>
{
    public const string DevToken = "api-test-dev-bearer-secret";
    private readonly string[] _roles;

    public DevBearerApiFactory()
        : this(
        [
            I2PAuthPolicies.Roles.Admin,
            I2PAuthPolicies.Roles.Operator,
            I2PAuthPolicies.Roles.Reader
        ])
    {
    }

    private DevBearerApiFactory(string[] roles)
    {
        _roles = roles;
    }

    public static DevBearerApiFactory WithRoles(params string[] roles) => new(roles);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            var values = new Dictionary<string, string?>
            {
                ["ConnectionStrings:I2P"] = "Server=(localdb)\\mssqllocaldb;Database=I2P_ApiTests;Trusted_Connection=True;TrustServerCertificate=True",
                ["Auth:Authority"] = "",
                ["Auth:DevBearerToken"] = DevToken,
                ["Auth:DevTenantId"] = "tenant-test",
                // Overwrite all Development array slots so role-restricted factories cannot inherit Admin/Operator.
                ["Auth:DevRoles:0"] = "",
                ["Auth:DevRoles:1"] = "",
                ["Auth:DevRoles:2"] = "",
                ["Auth:DevRoles:3"] = "",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Messaging:RabbitMq:Host"] = ""
            };
            for (var i = 0; i < _roles.Length; i++)
            {
                values[$"Auth:DevRoles:{i}"] = _roles[i];
            }

            config.AddInMemoryCollection(values);
        });

        builder.ConfigureServices(services =>
        {
            ReplaceDbContext(services);
            RemoveOutboxProcessor(services);
        });
    }

    internal static void ReplaceDbContext(IServiceCollection services)
    {
        services.RemoveAll(typeof(DbContextOptions<I2PDbContext>));
        services.RemoveAll(typeof(I2PDbContext));
        services.AddDbContext<I2PDbContext>(o => o.UseInMemoryDatabase("i2p-api-tests-" + Guid.NewGuid()));
    }

    internal static void RemoveOutboxProcessor(IServiceCollection services)
    {
        foreach (var d in services.Where(d => d.ImplementationType == typeof(OutboxProcessor)).ToList())
        {
            services.Remove(d);
        }
    }
}

public sealed class JwtApiFactory : WebApplicationFactory<Program>
{
    public static readonly SymmetricSecurityKey SigningKey =
        new(Encoding.UTF8.GetBytes("i2p-api-test-signing-key-32bytes!!"));

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:I2P"] = "Server=(localdb)\\mssqllocaldb;Database=I2P_JwtApiTests;Trusted_Connection=True;TrustServerCertificate=True",
                ["Auth:Authority"] = "https://test-idp.local/",
                ["Auth:Audience"] = "platform-i2p",
                ["Auth:RequireHttpsMetadata"] = "false",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Messaging:RabbitMq:Host"] = ""
            });
        });

        builder.ConfigureServices(services =>
        {
            services.PostConfigure<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, options =>
            {
                options.Authority = null;
                options.MetadataAddress = null!;
                options.RequireHttpsMetadata = false;
                options.Configuration = new OpenIdConnectConfiguration
                {
                    Issuer = "https://test-idp.local/"
                };
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = "https://test-idp.local/",
                    ValidateAudience = true,
                    ValidAudience = "platform-i2p",
                    ValidateLifetime = true,
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = SigningKey,
                    ClockSkew = TimeSpan.Zero,
                    NameClaimType = I2PAuthPolicies.ClaimTypes.Subject,
                    RoleClaimType = ClaimTypes.Role
                };
            });

            DevBearerApiFactory.ReplaceDbContext(services);
            DevBearerApiFactory.RemoveOutboxProcessor(services);
        });
    }

    public string CreateToken(TimeSpan expiresIn)
    {
        var credentials = new SigningCredentials(SigningKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: "https://test-idp.local/",
            audience: "platform-i2p",
            claims:
            [
                new Claim(I2PAuthPolicies.ClaimTypes.Subject, "jwt-user"),
                new Claim(I2PAuthPolicies.ClaimTypes.TenantId, "tenant-test"),
                new Claim(ClaimTypes.Role, I2PAuthPolicies.Roles.Reader)
            ],
            notBefore: DateTime.UtcNow.AddMinutes(-30),
            expires: DateTime.UtcNow.Add(expiresIn),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
