using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Persistence;
using Platform.I2P.Infrastructure.Persistence.Repositories;
using Platform.I2P.Infrastructure.Resilience;
using Platform.I2P.Infrastructure.Secrets;

namespace Platform.I2P.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddI2PInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        services.Configure<OutboxOptions>(configuration.GetSection("Outbox"));
        services.AddOptions<ResilienceOptions>()
            .Bind(configuration.GetSection("Resilience"))
            .ValidateOnStart();
        services.AddSingleton<Microsoft.Extensions.Options.IValidateOptions<ResilienceOptions>, ResilienceOptionsValidator>();
        services.Configure<ClientCredentialsOptions>(configuration.GetSection("Auth:ClientCredentials"));

        var connectionString = ResolveConnectionString(configuration, environment);

        services.AddDbContext<I2PDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddScoped<IIntegrationEndpointRepository, IntegrationEndpointRepository>();
        services.AddScoped<IFieldMappingRepository, FieldMappingRepository>();
        services.AddScoped<IExchangeRecordRepository, ExchangeRecordRepository>();
        services.AddScoped<IAuditWriter, EfAuditWriter>();
        services.AddScoped<IEventPublisher, MassTransitEventPublisher>();
        services.AddSingleton<ISecretsProvider, VaultSecretsProvider>();
        services.AddHttpClient("i2p-oauth");
        services.AddSingleton<IAccessTokenProvider, CachedAccessTokenProvider>();
        services.AddHostedService<OutboxProcessor>();

        var rabbitHost = configuration["Messaging:RabbitMq:Host"];
        if (!string.IsNullOrWhiteSpace(rabbitHost))
        {
            var username = configuration["Messaging:RabbitMq:Username"];
            var password = configuration["Messaging:RabbitMq:Password"];
            if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            {
                throw new InvalidOperationException(
                    "Messaging:RabbitMq:Username and Password are required when Host is configured. Do not rely on guest/guest.");
            }

            services.AddMassTransit(x =>
            {
                x.UsingRabbitMq((_, cfg) =>
                {
                    cfg.Host(rabbitHost, h =>
                    {
                        h.Username(username);
                        h.Password(password);
                    });
                });
            });
        }

        ValidateConnectorAddresses(configuration, environment);

        return services;
    }

    private static string ResolveConnectionString(IConfiguration configuration, IHostEnvironment environment)
    {
        var fromEnv = Environment.GetEnvironmentVariable("ConnectionStrings__I2P")
            ?? Environment.GetEnvironmentVariable("I2P_CONNECTION_STRING");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        var configured = configuration.GetConnectionString("I2P");
        if (string.IsNullOrWhiteSpace(configured))
        {
            throw new InvalidOperationException(
                "Connection string 'I2P' is required via ConnectionStrings__I2P / I2P_CONNECTION_STRING / user-secrets.");
        }

        if (!environment.IsDevelopment() &&
            configured.Contains("Password=", StringComparison.OrdinalIgnoreCase) &&
            !configured.Contains("Trusted_Connection=True", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Password-based SQL connection strings must not be loaded from appsettings outside Development. Use environment secrets.");
        }

        return configured;
    }

    private static void ValidateConnectorAddresses(IConfiguration configuration, IHostEnvironment environment)
    {
        if (environment.IsDevelopment())
        {
            return;
        }

        foreach (var key in new[] { "Sap", "Mes", "Cmms", "Gis", "Lims" })
        {
            var baseAddress = configuration[$"Connectors:{key}:BaseAddress"];
            if (string.IsNullOrWhiteSpace(baseAddress))
            {
                continue;
            }

            if (!Uri.TryCreate(baseAddress, UriKind.Absolute, out var uri) ||
                !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Connectors:{key}:BaseAddress must use HTTPS outside Development (FR-SEC-011/012).");
            }
        }
    }
}
