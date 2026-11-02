using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace Platform.I2P.Infrastructure.Messaging;

/// <summary>
/// Development without RabbitMQ may start, but readiness must report Unhealthy (D-02).
/// </summary>
public sealed class MessagingHealthCheck : IHealthCheck
{
    private readonly MessagingOptions _options;

    public MessagingHealthCheck(IOptions<MessagingOptions> options) => _options = options.Value;

    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default)
    {
        if (_options.IsConfigured)
        {
            return Task.FromResult(HealthCheckResult.Healthy("RabbitMQ messaging is configured."));
        }

        return Task.FromResult(HealthCheckResult.Unhealthy(
            "Messaging:RabbitMq is not configured; outbox delivery is disabled (D-02)."));
    }
}
