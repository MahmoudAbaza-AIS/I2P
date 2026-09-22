using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.ValueObjects;
using Polly;
using Polly.Timeout;

namespace Platform.I2P.Connectors.Lims;

public sealed class LimsConnectorOptions
{
    public string BaseAddress { get; set; } = "http://localhost:5105/";
    public string SecretReference { get; set; } = "lims:client-secret";
    public string SamplesPath { get; set; } = "api/samples";
    public string HealthPath { get; set; } = "api/health";
}

public sealed class LimsConnector : ILimsConnector
{
    private readonly HttpClient _httpClient;
    private readonly LimsAuthHandler _auth;
    private readonly LimsConnectorOptions _options;
    private readonly ILogger<LimsConnector> _logger;

    public LimsConnector(
        HttpClient httpClient,
        LimsAuthHandler auth,
        Microsoft.Extensions.Options.IOptions<LimsConnectorOptions> options,
        ILogger<LimsConnector> logger)
    {
        _httpClient = httpClient;
        _auth = auth;
        _options = options.Value;
        _logger = logger;
    }

    public string ConnectorName => "LIMS";

    public async Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
        return response.IsSuccessStatusCode
            ? new ConnectorHealth(true, "Healthy")
            : new ConnectorHealth(false, "Unhealthy", $"HTTP {(int)response.StatusCode}");
    }

    public async Task<IReadOnlyList<LimsSampleData>> GetSamplesAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.SamplesPath, cancellationToken);
        response.EnsureSuccessStatusCode();
        var payload = await JsonSerializer.DeserializeAsync<LimsSampleResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
        _logger.LogInformation("Fetched {Count} LIMS samples for {EndpointId}", payload.Samples.Count, endpointId);
        return payload.Samples.Select(LimsToInternalMapper.ToSample).ToList();
    }
}

public sealed class LimsAuthHandler
{
    private readonly Platform.I2P.Application.Security.IAccessTokenProvider _tokens;
    private readonly LimsConnectorOptions _options;

    public LimsAuthHandler(
        Platform.I2P.Application.Security.IAccessTokenProvider tokens,
        Microsoft.Extensions.Options.IOptions<LimsConnectorOptions> options)
    {
        _tokens = tokens;
        _options = options.Value;
    }

    public async Task ApplyAsync(HttpClient client, CancellationToken cancellationToken)
    {
        var token = await _tokens.GetAccessTokenAsync(_options.SecretReference, cancellationToken);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    }
}

internal sealed class LimsSampleResponse { public List<LimsSampleDto> Samples { get; set; } = []; }

internal sealed class LimsSampleDto
{
    public string? Id { get; set; }
    public string? SampleId { get; set; }
    public string? Analyte { get; set; }
    public string? Result { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public string? Quality { get; set; }
}

internal static class LimsToInternalMapper
{
    public static LimsSampleData ToSample(LimsSampleDto source)
    {
        var id = source.Id ?? throw new InvalidOperationException("LIMS sample missing Id.");
        var ts = source.Timestamp is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(source.Timestamp.Value);
        var quality = Enum.TryParse<QualityCode>(source.Quality, true, out var code)
            ? Quality.FromCode(code)
            : Quality.Good();
        return new LimsSampleData(
            id,
            source.SampleId ?? id,
            source.Analyte ?? "UNKNOWN",
            source.Result ?? string.Empty,
            ts,
            quality);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddLimsConnector(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<LimsConnectorOptions>(configuration.GetSection("Connectors:Lims"));
        services.AddSingleton<LimsAuthHandler>();
        services.AddHttpClient<ILimsConnector, LimsConnector>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<LimsConnectorOptions>>().Value.BaseAddress);
        }).AddPolicyHandler(CreatePolicy(configuration));
        return services;
    }

    private static IAsyncPolicy<HttpResponseMessage> CreatePolicy(IConfiguration configuration)
    {
        var retryCount = configuration.GetValue("Resilience:RetryCount", 3);
        var timeoutSeconds = configuration.GetValue("Resilience:TimeoutSeconds", 15);
        var circuitFailures = configuration.GetValue("Resilience:CircuitBreakerFailures", 5);
        var circuitSeconds = configuration.GetValue("Resilience:CircuitBreakerDurationSeconds", 30);
        var baseDelayMs = configuration.GetValue("Resilience:RetryBaseDelayMs", 200);
        return Policy.WrapAsync(
            Policy.TimeoutAsync<HttpResponseMessage>(TimeSpan.FromSeconds(timeoutSeconds), TimeoutStrategy.Optimistic),
            Policy<HttpResponseMessage>
                .Handle<HttpRequestException>()
                .Or<TimeoutRejectedException>()
                .OrResult(r => (int)r.StatusCode >= 500)
                .WaitAndRetryAsync(retryCount, attempt => TimeSpan.FromMilliseconds(baseDelayMs * Math.Pow(2, attempt - 1))),
            Policy<HttpResponseMessage>
                .Handle<HttpRequestException>()
                .OrResult(r => (int)r.StatusCode >= 500)
                .CircuitBreakerAsync(circuitFailures, TimeSpan.FromSeconds(circuitSeconds)));
    }
}

