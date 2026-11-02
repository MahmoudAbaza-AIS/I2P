using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Scalar.AspNetCore;

namespace Platform.I2P.Api.OpenApi;

/// <summary>
/// OpenAPI configuration for .NET 10 built-in document generation (FR-API-008/019).
/// Scalar UI is available in all environments for API documentation and testing.
/// Spec is served at /openapi/v1.json, v2.json, etc. and displayed via Scalar at /.
/// Uses Scalar's built-in Mars theme for professional dark appearance.
/// </summary>
public static class ScalarConfiguration
{
    public static IServiceCollection AddI2POpenApi(this IServiceCollection services)
    {
        // Register versioned OpenAPI documents
        services.AddOpenApi("v1", options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Title = "Platform I2P API";
                document.Info.Version = "v1";
                document.Info.Description =
                    "Integration-to-Platform module API v1. Response-time budget for health endpoints: 2000ms; sync endpoints: 5000ms (IMP-PLAN-001 §5).";
                document.Info.Contact = new()
                {
                    Name = "Platform I2P Team",
                    Email = "support@platform-i2p.local"
                };
                document.Info.License = new()
                {
                    Name = "Internal Use Only"
                };
                return Task.CompletedTask;
            });
        });

        return services;
    }

    public static WebApplication UseI2POpenApi(this WebApplication app)
    {
        // Always expose OpenAPI spec (no auth required for API documentation)
        app.MapOpenApi().AllowAnonymous();

        // Always expose Scalar UI with Mars theme (no auth required for documentation)
        // Default path is /scalar (the default endpoint prefix in Scalar)
        app.MapScalarApiReference(options =>
        {
            options.WithTitle("Platform I2P API");
            options.WithTheme(ScalarTheme.Mars);
            options.WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
            options.WithPreferredScheme("https");
        }).AllowAnonymous();

        return app;
    }
}
