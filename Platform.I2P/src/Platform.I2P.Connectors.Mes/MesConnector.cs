using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.ValueObjects;
using Polly;
using Polly.Timeout;

namespace Platform.I2P.Connectors.Mes;

public sealed class MesConnectorOptions
{
    public string BaseAddress { get; set; } = "http://localhost:5102/";
    public string SecretReference { get; set; } = "mes:client-secret";
    public string WorkOrdersPath { get; set; } = "api/workOrders";
    public string HealthPath { get; set; } = "api/health";
}

public sealed class MesConnector : IMesConnector
{
    private readonly HttpClient _httpClient;
    private readonly MesAuthHandler _auth;
    private readonly MesConnectorOptions _options;
    private readonly ILogger<MesConnector> _logger;

    public MesConnector(
        HttpClient httpClient,
        MesAuthHandler auth,
        Microsoft.Extensions.Options.IOptions<MesConnectorOptions> options,
        ILogger<MesConnector> logger)
    {
        _httpClient = httpClient;
        _auth = auth;
        _options = options.Value;
        _logger = logger;
    }

    public string ConnectorName => "MES";

    public async Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
        return response.IsSuccessStatusCode
            ? new ConnectorHealth(true, "Healthy")
            : new ConnectorHealth(false, "Unhealthy", $"HTTP {(int)response.StatusCode}");
    }

    public async Task<ConnectorBatchResult<MesWorkOrderData>> GetWorkOrdersAsync(
        Guid endpointId,
        CancellationToken cancellationToken = default)
    {
        await _auth.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.WorkOrdersPath, cancellationToken);
        response.EnsureSuccessStatusCode();
        var payload = await JsonSerializer.DeserializeAsync<MesWorkOrderResponse>(
            await response.Content.ReadAsStreamAsync(cancellationToken),
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("MES work-order response body was empty or could not be deserialized.");
        var batch = ConnectorBatchMapper.MapAll(payload.Items, MesToInternalMapper.ToWorkOrder);
        _logger.LogInformation(
            "MES work orders for {EndpointId}: source={Source} accepted={Accepted} rejected={Rejected}",
            endpointId, payload.Items.Count, batch.Accepted.Count, batch.RejectedReasons.Count);
        return batch;
    }
}

public sealed class MesAuthHandler
{
    private readonly Platform.I2P.Application.Security.IAccessTokenProvider _tokens;
    private readonly MesConnectorOptions _options;

    public MesAuthHandler(
        Platform.I2P.Application.Security.IAccessTokenProvider tokens,
        Microsoft.Extensions.Options.IOptions<MesConnectorOptions> options)
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

internal sealed class MesWorkOrderResponse
{
    public List<MesWorkOrderDto> Items { get; set; } = [];
}

internal sealed class MesWorkOrderDto
{
    public string? Id { get; set; }
    public string? OrderNumber { get; set; }
    public string? Status { get; set; }
    public DateTimeOffset? Timestamp { get; set; }
    public string? Quality { get; set; }
}

internal static class MesToInternalMapper
{
    public static MesWorkOrderData ToWorkOrder(MesWorkOrderDto source)
    {
        var id = string.IsNullOrWhiteSpace(source.Id)
            ? throw new Platform.I2P.Domain.Exceptions.RecordMappingException("MES work order missing required Id.")
            : source.Id;
        if (string.IsNullOrWhiteSpace(source.OrderNumber))
        {
            throw new Platform.I2P.Domain.Exceptions.RecordMappingException(
                $"MES work order '{id}' missing required OrderNumber.");
        }

        if (string.IsNullOrWhiteSpace(source.Status))
        {
            throw new Platform.I2P.Domain.Exceptions.RecordMappingException(
                $"MES work order '{id}' missing required Status.");
        }

        var ts = source.Timestamp is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(source.Timestamp.Value);
        var quality = Enum.TryParse<QualityCode>(source.Quality, true, out var code)
            ? Quality.FromCode(code)
            : Quality.Unknown("SourceDidNotProvideQuality");
        return new MesWorkOrderData(id, source.OrderNumber, source.Status, ts, quality);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddMesConnector(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<MesConnectorOptions>(configuration.GetSection("Connectors:Mes"));
        services.AddSingleton<MesAuthHandler>();
        var policy = ConnectorResilience.Create(configuration);
        services.AddHttpClient<IMesConnector, MesConnector>((sp, client) =>
        {
            client.BaseAddress = new Uri(sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MesConnectorOptions>>().Value.BaseAddress);
        }).AddPolicyHandler(policy);
        return services;
    }
}

internal static class ConnectorResilience
{
    public static IAsyncPolicy<HttpResponseMessage> Create(IConfiguration configuration)
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

