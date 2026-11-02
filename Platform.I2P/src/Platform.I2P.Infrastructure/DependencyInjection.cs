using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Observability;
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
        services.AddOptions<ResilienceOptions>()
            .Bind(configuration.GetSection("Resilience"))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<ResilienceOptions>, ResilienceOptionsValidator>();
        services.Configure<ClientCredentialsOptions>(configuration.GetSection("Auth:ClientCredentials"));

        services.AddOptions<MessagingOptions>()
            .Bind(configuration.GetSection(MessagingOptions.SectionName))
            .ValidateOnStart();
        services.AddSingleton<IValidateOptions<MessagingOptions>, MessagingOptionsValidator>();

        services.AddOptions<OutboxDeliveryOptions>()
            .Bind(configuration.GetSection(OutboxDeliveryOptions.SectionName))
            .ValidateOnStart();

        var connectionString = ResolveConnectionString(configuration, environment);

        services.AddDbContext<I2PDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddScoped<IIntegrationEndpointRepository, IntegrationEndpointRepository>();
        services.AddScoped<IFieldMappingRepository, FieldMappingRepository>();
        services.AddScoped<IExchangeRecordRepository, ExchangeRecordRepository>();
        services.AddScoped<IAuditWriter, EfAuditWriter>();
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IEventPublisher, MassTransitEventPublisher>();
        services.AddScoped<IDeadLetterOutboxService, DeadLetterOutboxService>();
        services.AddSingleton<ISecretsProvider, VaultSecretsProvider>();
        services.AddHttpClient("i2p-oauth");
        services.AddSingleton<IAccessTokenProvider, CachedAccessTokenProvider>();
        services.AddSingleton<OutboxMetrics>();
        services.AddHostedService<OutboxMetricsCollector>();
        services.AddHostedService<OutboxDeadLetterSweeper>();
        services.AddSingleton<MessagingHealthCheck>();

        var messaging = configuration.GetSection(MessagingOptions.SectionName).Get<MessagingOptions>()
            ?? new MessagingOptions();

        services.AddMassTransit(x =>
        {
            x.AddEntityFrameworkOutbox<I2PDbContext>(o =>
            {
                o.QueryDelay = TimeSpan.FromSeconds(1);
                o.UseSqlServer();
                o.UseBusOutbox(busOutbox =>
                {
                    busOutbox.MessageDeliveryLimit = 50;
                    // Single-message delivery batches preserve publish order for a partition (NFR-REL-036).
                    busOutbox.MessageDeliveryTimeout = TimeSpan.FromSeconds(10);
                    if (!messaging.IsConfigured)
                    {
                        // Development without Rabbit: stage outbox rows but do not deliver (D-02).
                        busOutbox.DisableDeliveryService();
                    }
                });
            });

            x.AddConfigureEndpointsCallback((context, _, cfg) =>
            {
                cfg.UseEntityFrameworkOutbox<I2PDbContext>(context);
            });

            if (messaging.IsConfigured)
            {
                x.UsingRabbitMq((context, cfg) =>
                {
                    cfg.Host(messaging.Host, h =>
                    {
                        h.Username(messaging.Username);
                        h.Password(messaging.Password);
                        h.PublisherConfirmation = true;
                    });
                    cfg.ConfigureEndpoints(context);
                });
            }
            else
            {
                x.UsingInMemory((context, cfg) =>
                {
                    cfg.ConfigureEndpoints(context);
                });
            }
        });

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
