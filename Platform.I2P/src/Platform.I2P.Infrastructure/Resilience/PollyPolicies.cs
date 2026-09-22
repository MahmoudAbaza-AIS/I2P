using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Polly;
using Polly.CircuitBreaker;
using Polly.Retry;
using Polly.Timeout;

namespace Platform.I2P.Infrastructure.Resilience;

public sealed class ResilienceOptions
{
    /// <summary>Rationale: vendor APIs can flap; 3 retries balances recovery vs latency budgets (IMP-PLAN-001 §5).</summary>
    public int RetryCount { get; set; } = 3;

    /// <summary>Rationale: exponential base delay before circuit opens for sustained outages (FR-API-066).</summary>
    public int RetryBaseDelayMs { get; set; } = 200;

    /// <summary>Rationale: fail fast after repeated faults so request threads are not exhausted.</summary>
    public int CircuitBreakerFailures { get; set; } = 5;

    public int CircuitBreakerDurationSeconds { get; set; } = 30;

    /// <summary>Rationale: every outbound call must have a hard timeout (PR standards §4).</summary>
    public int TimeoutSeconds { get; set; } = 15;
}

/// <summary>Fails fast on invalid resilience tuning so bad config never becomes active (PR standards §7).</summary>
public sealed class ResilienceOptionsValidator : IValidateOptions<ResilienceOptions>
{
    public ValidateOptionsResult Validate(string? name, ResilienceOptions options)
    {
        var errors = new List<string>();
        if (options.RetryCount is < 0 or > 10)
        {
            errors.Add("Resilience:RetryCount must be between 0 and 10.");
        }

        if (options.RetryBaseDelayMs is < 1 or > 60_000)
        {
            errors.Add("Resilience:RetryBaseDelayMs must be between 1 and 60000.");
        }

        if (options.CircuitBreakerFailures is < 1 or > 100)
        {
            errors.Add("Resilience:CircuitBreakerFailures must be between 1 and 100.");
        }

        if (options.CircuitBreakerDurationSeconds is < 1 or > 600)
        {
            errors.Add("Resilience:CircuitBreakerDurationSeconds must be between 1 and 600.");
        }

        if (options.TimeoutSeconds is < 1 or > 300)
        {
            errors.Add("Resilience:TimeoutSeconds must be between 1 and 300.");
        }

        return errors.Count == 0
            ? ValidateOptionsResult.Success
            : ValidateOptionsResult.Fail(errors);
    }
}

public static class PollyPolicies
{
    public const string HttpPipelineKey = "i2p-external-http";

    public static IAsyncPolicy<HttpResponseMessage> CreateHttpPolicy(ResilienceOptions options)
    {
        var timeout = Policy.TimeoutAsync<HttpResponseMessage>(
            TimeSpan.FromSeconds(options.TimeoutSeconds),
            TimeoutStrategy.Optimistic);

        var retry = Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .Or<TimeoutRejectedException>()
            .OrResult(r => (int)r.StatusCode >= 500 || r.StatusCode == System.Net.HttpStatusCode.RequestTimeout)
            .WaitAndRetryAsync(
                options.RetryCount,
                attempt => TimeSpan.FromMilliseconds(options.RetryBaseDelayMs * Math.Pow(2, attempt - 1)));

        var circuitBreaker = Policy<HttpResponseMessage>
            .Handle<HttpRequestException>()
            .Or<TimeoutRejectedException>()
            .OrResult(r => (int)r.StatusCode >= 500)
            .CircuitBreakerAsync(
                options.CircuitBreakerFailures,
                TimeSpan.FromSeconds(options.CircuitBreakerDurationSeconds));

        return Policy.WrapAsync(timeout, retry, circuitBreaker);
    }

    public static IHttpClientBuilder AddI2PResilienceHandler(
        this IHttpClientBuilder builder,
        IConfiguration configuration)
    {
        var options = configuration.GetSection("Resilience").Get<ResilienceOptions>() ?? new ResilienceOptions();
        var policy = CreateHttpPolicy(options);
        return builder.AddPolicyHandler(policy);
    }
}
