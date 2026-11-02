using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.ValueObjects;
using Polly;
using Polly.Timeout;

namespace Platform.I2P.Connectors.Sap;

public sealed class SapConnectorOptions
{
    public string BaseAddress { get; set; } = "http://localhost:5101/";
    public string SecretReference { get; set; } = "sap:client-secret";
    public string PurchaseOrdersPath { get; set; } = "api/purchaseOrders";
    public string HealthPath { get; set; } = "api/health";
}

/// <summary>
/// SAP OData-style HTTP connector. Vendor DTO types stay inside this project only.
/// Incomplete source records are rejected — never fabricated (WP1b / N-01).
/// </summary>
public sealed class SapConnector : IErpConnector
{
    private readonly HttpClient _httpClient;
    private readonly SapAuthHandler _authHandler;
    private readonly SapConnectorOptions _options;
    private readonly ILogger<SapConnector> _logger;

    public SapConnector(
        HttpClient httpClient,
        SapAuthHandler authHandler,
        Microsoft.Extensions.Options.IOptions<SapConnectorOptions> options,
        ILogger<SapConnector> logger)
    {
        _httpClient = httpClient;
        _authHandler = authHandler;
        _options = options.Value;
        _logger = logger;
    }

    public string ConnectorName => "SAP";

    public async Task<ConnectorHealth> GetHealthAsync(CancellationToken cancellationToken = default)
    {
        await _authHandler.ApplyAsync(_httpClient, cancellationToken);
        using var response = await _httpClient.GetAsync(_options.HealthPath, cancellationToken);
        return response.IsSuccessStatusCode
            ? new ConnectorHealth(true, "Healthy")
            : new ConnectorHealth(false, "Unhealthy", $"HTTP {(int)response.StatusCode}");
    }

    public async Task<ConnectorBatchResult<PurchaseOrderData>> GetPurchaseOrdersAsync(
        Guid endpointId,
        string? purchaseOrderNumber = null,
        CancellationToken cancellationToken = default)
    {
        await _authHandler.ApplyAsync(_httpClient, cancellationToken);

        var path = string.IsNullOrWhiteSpace(purchaseOrderNumber)
            ? _options.PurchaseOrdersPath
            : $"{_options.PurchaseOrdersPath}?number={Uri.EscapeDataString(purchaseOrderNumber)}";

        using var response = await _httpClient.GetAsync(path, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<SapPurchaseOrderResponse>(
            stream,
            SapJson.Options,
            cancellationToken)
            ?? throw new InvalidOperationException(
                "SAP purchase-order response body was empty or could not be deserialized.");

        var batch = ConnectorBatchMapper.MapAll(payload.Value, SapToInternalMapper.ToPurchaseOrder);

        _logger.LogInformation(
            "SAP purchase orders for endpoint {EndpointId}: source={SourceCount} accepted={Accepted} rejected={Rejected}",
            endpointId,
            payload.Value.Count,
            batch.Accepted.Count,
            batch.RejectedReasons.Count);

        foreach (var reason in batch.RejectedReasons)
        {
            _logger.LogWarning("SAP record rejected: {Reason}", reason);
        }

        return batch;
    }
}

public sealed class SapAuthHandler
{
    private readonly Platform.I2P.Application.Security.IAccessTokenProvider _tokens;
    private readonly SapConnectorOptions _options;

    public SapAuthHandler(
        Platform.I2P.Application.Security.IAccessTokenProvider tokens,
        Microsoft.Extensions.Options.IOptions<SapConnectorOptions> options)
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

internal static class SapJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };
}

internal sealed class SapPurchaseOrderResponse
{
    public List<SapPurchaseOrderDto> Value { get; set; } = [];
}

/// <summary>SAP native shape — must not leave this connector project.</summary>
internal sealed class SapPurchaseOrderDto
{
    public string? Ebeln { get; set; }
    public string? Lifnr { get; set; }
    public decimal Netwr { get; set; }
    public string? Waers { get; set; }
    public DateTimeOffset? Aedat { get; set; }
    public string? Quality { get; set; }
}

internal static class SapToInternalMapper
{
    public static PurchaseOrderData ToPurchaseOrder(SapPurchaseOrderDto source)
    {
        var number = string.IsNullOrWhiteSpace(source.Ebeln)
            ? throw new Platform.I2P.Domain.Exceptions.RecordMappingException("SAP PO missing required EBELN.")
            : source.Ebeln;

        if (string.IsNullOrWhiteSpace(source.Lifnr))
        {
            throw new Platform.I2P.Domain.Exceptions.RecordMappingException(
                $"SAP PO '{number}' missing required vendor (LIFNR).");
        }

        if (string.IsNullOrWhiteSpace(source.Waers))
        {
            throw new Platform.I2P.Domain.Exceptions.RecordMappingException(
                $"SAP PO '{number}' missing required currency (WAERS).");
        }

        var timestamp = source.Aedat is null
            ? OperationalTimestamp.FromPlatform()
            : OperationalTimestamp.FromSource(source.Aedat.Value);

        var quality = Enum.TryParse<QualityCode>(source.Quality, true, out var code)
            ? Quality.FromCode(code)
            : Quality.Unknown("SourceDidNotProvideQuality");

        return new PurchaseOrderData(
            number,
            number,
            source.Lifnr,
            source.Netwr,
            source.Waers,
            timestamp,
            quality);
    }
}

public static class DependencyInjection
{
    public static IServiceCollection AddSapConnector(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<SapConnectorOptions>(configuration.GetSection("Connectors:Sap"));
        services.AddSingleton<SapAuthHandler>();

        var retryCount = configuration.GetValue("Resilience:RetryCount", 3);
        var timeoutSeconds = configuration.GetValue("Resilience:TimeoutSeconds", 15);
        var circuitFailures = configuration.GetValue("Resilience:CircuitBreakerFailures", 5);
        var circuitSeconds = configuration.GetValue("Resilience:CircuitBreakerDurationSeconds", 30);
        var baseDelayMs = configuration.GetValue("Resilience:RetryBaseDelayMs", 200);

        // Rationale: FR-API-066 — never call external systems without timeout + circuit breaker.
        var policy = Policy.WrapAsync(
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

        services.AddHttpClient<IErpConnector, SapConnector>((sp, client) =>
            {
                var options = sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<SapConnectorOptions>>().Value;
                client.BaseAddress = new Uri(options.BaseAddress);
            })
            .AddPolicyHandler(policy);

        return services;
    }
}
