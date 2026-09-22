using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.ValueObjects;
using Polly;
using Polly.Timeout;

namespace Platform.I2P.Connectors.Cmms;

public sealed class CmmsConnectorOptions
{
    public string BaseAddress { get; set; } = "http://localhost:5103/";
    public string SecretReference { get; set; } = "cmms:client-secret";
    public string WorkOrdersPath { get; set; } = "api/workOrders";
    public string HealthPath { get; set; } = "api/health";
}

public sealed class CmmsConnector : ICmmsConnector
{
    private readonly HttpClient _httpClient;
    private readonly CmmsAuthHandler _auth;
    private readonly CmmsConnectorOptions _options;
    private readonly ILogger<CmmsConnector> _logger;

    public CmmsConnector(
        HttpClient httpClient,
        CmmsAuthHandler auth,
        Microsoft.Extensions.Options.IOptions<CmmsConnectorOptions> options,
        ILogger<CmmsConnector> logger)
    {
        _httpClient = httpClient;
        _auth = auth;
        _options = options.Value;
        _logger = logger;
    }

    public string ConnectorName => "CMMS";

    public async Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
        return response.IsSuccessStatusCode
            ? new ConnectorHealth(true, "Healthy")
            : new ConnectorHealth(false, "Unhealthy", $"HTTP {(int)response.StatusCode}");
    }

    public async Task<IReadOnlyList<CmmsWorkOrderData>> GetWorkOrdersAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.WorkOrdersPath, cancellationToken);
        response.EnsureSuccessStatusCode();
        var payload = await JsonSerializer.DeserializeAsync<CmmsWorkOrderResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
        _logger.LogInformation("Fetched {Count} CMMS work orders for {EndpointId}", payload.Items.Count, endpointId);
        return payload.Items.Select(CmmsToInternalMapper.ToWorkOrder).ToList();
    }
}

public sealed class CmmsAuthHandler
{
    private readonly Platform.I2P.Application.Security.IAccessTokenProvider _tokens;
    private readonly CmmsConnectorOptions _options;

    public CmmsAuthHandler(
        Platform.I2P.Application.Security.IAccessTokenProvider tokens,
        Microsoft.Extensions.Options.IOptions<CmmsConnectorOptions> options)
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

internal sealed class CmmsWorkOrderResponse { public List<CmmsWorkOrderDto> Items { get; set; } = []; }

internal sealed class CmmsWorkOrderDto
{
    public string? Id { get; set; }
    public string? WorkOrderNumber { get; set; }
    public string? AssetId { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public string? Quality { get; set; }
}

internal static class CmmsToInternalMapper
{
    public static CmmsWorkOrderData ToWorkOrder(CmmsWorkOrderDto source)
    {
        var id = source.Id ?? throw new InvalidOperationException("CMMS work order missing Id.");
        var ts = source.Timestamp is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(source.Timestamp.Value);
        var quality = Enum.TryParse<QualityCode>(source.Quality, true, out var code)
            ? Quality.FromCode(code)
            : Quality.Good();
        return new CmmsWorkOrderData(id, source.WorkOrderNumber ?? id, source.AssetId ?? "UNKNOWN", ts, quality);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddCmmsConnector(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<CmmsConnectorOptions>(configuration.GetSection("Connectors:Cmms"));
        services.AddSingleton<CmmsAuthHandler>();
        services.AddHttpClient<ICmmsConnector, CmmsConnector>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<CmmsConnectorOptions>>().Value.BaseAddress);
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

