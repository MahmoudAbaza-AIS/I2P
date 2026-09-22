using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Platform.I2P.Api.OpenApi;

/// <summary>
/// OpenAPI configuration for .NET 10 built-in document generation (FR-API-008/019).
/// Spec is served at /openapi/v1.json.
/// </summary>
public static class SwaggerConfiguration
{
    public static IServiceCollection AddI2POpenApi(this IServiceCollection services)
    {
        services.AddOpenApi("v1", options =>
        {
            options.AddDocumentTransformer((document, _, _) =>
            {
                document.Info.Title = "Platform I2P API";
                document.Info.Version = "v1";
                document.Info.Description =
                    "Integration-to-Platform module API. Response-time budget for health endpoints: 2000ms; sync endpoints: 5000ms (IMP-PLAN-001 §5).";
                return Task.CompletedTask;
            });
        });

        return services;
    }

    public static WebApplication UseI2POpenApi(this WebApplication app)
    {
        app.MapOpenApi();
        return app;
    }
}
