using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.ValueObjects;
using Polly;
using Polly.Timeout;

namespace Platform.I2P.Connectors.Gis;

public sealed class GisConnectorOptions
{
    public string BaseAddress { get; set; } = "http://localhost:5104/";
    public string SecretReference { get; set; } = "gis:client-secret";
    public string FeaturesPath { get; set; } = "api/features";
    public string HealthPath { get; set; } = "api/health";
}

public sealed class GisConnector : IGisConnector
{
    private readonly HttpClient _httpClient;
    private readonly GisAuthHandler _auth;
    private readonly GisConnectorOptions _options;
    private readonly ILogger<GisConnector> _logger;

    public GisConnector(
        HttpClient httpClient,
        GisAuthHandler auth,
        Microsoft.Extensions.Options.IOptions<GisConnectorOptions> options,
        ILogger<GisConnector> logger)
    {
        _httpClient = httpClient;
        _auth = auth;
        _options = options.Value;
        _logger = logger;
    }

    public string ConnectorName => "GIS";

    public async Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
        return response.IsSuccessStatusCode
            ? new ConnectorHealth(true, "Healthy")
            : new ConnectorHealth(false, "Unhealthy", $"HTTP {(int)response.StatusCode}");
    }

    public async Task<IReadOnlyList<GisFeatureData>> GetFeaturesAsync(
        Guid endpointId,
        string layerName,
        CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        var path = $"{_options.FeaturesPath}?layer={Uri.EscapeDataString(layerName)}";
        using var response = await _httpClient.GetAsync(path, cancellationToken);
        response.EnsureSuccessStatusCode();
        var payload = await JsonSerializer.DeserializeAsync<GisFeatureResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
        _logger.LogInformation("Fetched {Count} GIS features for {EndpointId}", payload.Features.Count, endpointId);
        return payload.Features.Select(f => GisToInternalMapper.ToFeature(f, layerName)).ToList();
    }
}

public sealed class GisAuthHandler
{
    private readonly Platform.I2P.Application.Security.IAccessTokenProvider _tokens;
    private readonly GisConnectorOptions _options;

    public GisAuthHandler(
        Platform.I2P.Application.Security.IAccessTokenProvider tokens,
        Microsoft.Extensions.Options.IOptions<GisConnectorOptions> options)
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

internal sealed class GisFeatureResponse { public List<GisFeatureDto> Features { get; set; } = []; }

internal sealed class GisFeatureDto
{
    public string? Id { get; set; }
    public string? Geometry { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public string? Quality { get; set; }
}

internal static class GisToInternalMapper
{
    public static GisFeatureData ToFeature(GisFeatureDto source, string layerName)
    {
        var id = source.Id ?? throw new InvalidOperationException("GIS feature missing Id.");
        var ts = source.Timestamp is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(source.Timestamp.Value);
        var quality = Enum.TryParse<QualityCode>(source.Quality, true, out var code)
            ? Quality.FromCode(code)
            : Quality.Good();
        return new GisFeatureData(id, layerName, source.Geometry ?? "{}", ts, quality);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddGisConnector(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<GisConnectorOptions>(configuration.GetSection("Connectors:Gis"));
        services.AddSingleton<GisAuthHandler>();
        services.AddHttpClient<IGisConnector, GisConnector>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<GisConnectorOptions>>().Value.BaseAddress);
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

