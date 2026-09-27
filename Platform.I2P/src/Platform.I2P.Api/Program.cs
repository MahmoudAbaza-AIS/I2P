using System.Threading.RateLimiting;
using Asp.Versioning;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Platform.I2P.Api.Middleware;
using Platform.I2P.Api.OpenApi;
using Platform.I2P.Api.Security;
using Platform.I2P.Application;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Cmms;
using Platform.I2P.Connectors.Gis;
using Platform.I2P.Connectors.Lims;
using Platform.I2P.Connectors.Mes;
using Platform.I2P.Connectors.Sap;
using Platform.I2P.Domain.Exceptions;
using Platform.I2P.Infrastructure;
using Platform.I2P.Infrastructure.Persistence;
using Serilog;

namespace Platform.I2P.Api;

public partial class Program
{
    public static void Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        builder.Host.UseSerilog((ctx, cfg) =>
            cfg.ReadFrom.Configuration(ctx.Configuration)
                .Enrich.FromLogContext()
                .Enrich.WithEnvironmentName()
                .Enrich.WithThreadId()
                .WriteTo.Console());

        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUserContext, HttpCurrentUserContext>();

        builder.Services.AddI2PApplication();
        builder.Services.AddI2PInfrastructure(builder.Configuration, builder.Environment);
        builder.Services.AddSapConnector(builder.Configuration);
        builder.Services.AddMesConnector(builder.Configuration);
        builder.Services.AddCmmsConnector(builder.Configuration);
        builder.Services.AddGisConnector(builder.Configuration);
        builder.Services.AddLimsConnector(builder.Configuration);

        builder.Services.AddControllers();

        // Configure API versioning
        builder.Services.AddApiVersioning(options =>
        {
            options.DefaultApiVersion = new ApiVersion(1, 0);
            options.AssumeDefaultVersionWhenUnspecified = true;
            options.ReportApiVersions = true;
            options.ApiVersionReader = ApiVersionReader.Combine(
                new UrlSegmentApiVersionReader(),
                new HeaderApiVersionReader("X-API-Version")
            );
        }).AddMvc();

        builder.Services.AddI2POpenApi();
        builder.Services.AddHealthChecks()
            .AddDbContextCheck<I2PDbContext>("sqlserver", tags: ["ready"]);

        ConfigureAuthentication(builder);
        ConfigureAuthorization(builder.Services);

        builder.Services.AddRateLimiter(options =>
        {
            options.AddFixedWindowLimiter("i2p", limiter =>
            {
                limiter.Window = TimeSpan.FromMinutes(1);
                limiter.PermitLimit = builder.Configuration.GetValue("RateLimiting:PermitLimit", 120);
                limiter.QueueLimit = 0;
            });
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        });

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService("Platform.I2P"))
            .WithTracing(t => t
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddOtlpExporter())
            .WithMetrics(m => m
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddOtlpExporter());

        var app = builder.Build();

        app.UseMiddleware<CorrelationIdMiddleware>();
        app.UseSerilogRequestLogging();

        app.UseHttpsRedirection();

        // Map Scalar UI and OpenAPI BEFORE authentication middleware so they can bypass auth
        app.UseI2POpenApi();

        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();

        app.Use(async (context, next) =>
        {
            try
            {
                await next();
            }
            catch (ValidationException ex)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response.WriteAsJsonAsync(new
                {
                    error = "Validation failed",
                    details = ex.Errors.Select(e => new { e.PropertyName, e.ErrorMessage })
                });
            }
            catch (ForbiddenResourceException ex)
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { error = ex.Message, resourceId = ex.ResourceId });
            }
            catch (UnauthorizedAccessException ex)
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsJsonAsync(new { error = ex.Message });
            }
        });

        // Liveness/readiness are unauthenticated so the reverse proxy can health-check before cutover (PR §9).
        app.MapGet("/health/live", () => Results.Ok(new { status = "Healthy" })).AllowAnonymous();
        app.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = check => check.Tags.Contains("ready")
        }).AllowAnonymous();

        // Controllers require Reader policy by default, unless overridden by controller attributes
        app.MapControllers().RequireAuthorization(I2PAuthPolicies.Reader).RequireRateLimiting("i2p");

        if (app.Configuration.GetValue("Database:ApplyMigrationsOnStartup", false))
        {
            using var scope = app.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<I2PDbContext>();
            db.Database.Migrate();
        }

        app.Run();
    }

    private static void ConfigureAuthentication(WebApplicationBuilder builder)
    {
        var authority = builder.Configuration["Auth:Authority"];
        var isDevelopment = builder.Environment.IsDevelopment();

        if (!string.IsNullOrWhiteSpace(authority))
        {
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(options =>
                {
                    options.Authority = authority;
                    options.Audience = builder.Configuration["Auth:Audience"];
                    options.RequireHttpsMetadata = builder.Configuration.GetValue("Auth:RequireHttpsMetadata", true);
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateIssuer = true,
                        ValidateAudience = true,
                        ValidateLifetime = true,
                        ValidateIssuerSigningKey = true,
                        NameClaimType = I2PAuthPolicies.ClaimTypes.Subject,
                        RoleClaimType = System.Security.Claims.ClaimTypes.Role
                    };
                });
            return;
        }

        if (!isDevelopment)
        {
            throw new InvalidOperationException(
                "Auth:Authority is required outside Development. Configure Entra ID or Duende IdentityServer before starting.");
        }

        builder.Services.AddAuthentication("DevBearer")
            .AddScheme<Microsoft.AspNetCore.Authentication.AuthenticationSchemeOptions, DevBearerAuthenticationHandler>(
                "DevBearer",
                _ => { });
    }

    private static void ConfigureAuthorization(IServiceCollection services)
    {
        services.AddAuthorization(options =>
        {
            // Do NOT set FallbackPolicy or DefaultPolicy
            // Instead rely on explicit [AllowAnonymous] and [Authorize] attributes

            options.AddPolicy(I2PAuthPolicies.Reader, policy =>
                policy.RequireRole(
                    I2PAuthPolicies.Roles.Reader,
                    I2PAuthPolicies.Roles.Operator,
                    I2PAuthPolicies.Roles.Admin));

            options.AddPolicy(I2PAuthPolicies.Operator, policy =>
                policy.RequireRole(
                    I2PAuthPolicies.Roles.Operator,
                    I2PAuthPolicies.Roles.Admin));

            options.AddPolicy(I2PAuthPolicies.Admin, policy =>
                policy.RequireRole(I2PAuthPolicies.Roles.Admin));
        });
    }
}
