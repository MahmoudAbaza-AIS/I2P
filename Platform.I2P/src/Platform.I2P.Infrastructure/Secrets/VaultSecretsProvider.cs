using System.Collections.Concurrent;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Infrastructure.Secrets;

/// <summary>
/// Resolves secrets from environment variables (and KeyVault-style env names).
/// Configuration-file secret values are refused outside Development (FR-SEC-031).
/// </summary>
public sealed class VaultSecretsProvider : ISecretsProvider
{
    private readonly IConfiguration _configuration;
    private readonly IHostEnvironment _environment;
    private readonly ILogger<VaultSecretsProvider> _logger;

    public VaultSecretsProvider(
        IConfiguration configuration,
        IHostEnvironment environment,
        ILogger<VaultSecretsProvider> logger)
    {
        _configuration = configuration;
        _environment = environment;
        _logger = logger;
    }

    public Task<string?> GetSecretAsync(string secretReference, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secretReference))
        {
            return Task.FromResult<string?>(null);
        }

        var envKey = secretReference.Replace(':', '_').Replace('-', '_').ToUpperInvariant();
        var fromEnv = Environment.GetEnvironmentVariable(envKey)
            ?? Environment.GetEnvironmentVariable($"I2P_SECRET_{envKey}");

        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Task.FromResult<string?>(fromEnv);
        }

        if (_environment.IsDevelopment())
        {
            var fromConfig = _configuration[$"Secrets:{secretReference}"];
            if (!string.IsNullOrEmpty(fromConfig))
            {
                _logger.LogDebug("Resolved secret {SecretReference} from Development configuration", secretReference);
                return Task.FromResult<string?>(fromConfig);
            }
        }
        else if (!string.IsNullOrEmpty(_configuration[$"Secrets:{secretReference}"]))
        {
            _logger.LogError(
                "Secret {SecretReference} was present under Secrets: configuration but is refused outside Development",
                secretReference);
        }

        _logger.LogWarning("Secret reference {SecretReference} was not found", secretReference);
        return Task.FromResult<string?>(null);
    }
}

public sealed class ClientCredentialsOptions
{
    /// <summary>Rationale: FR-SEC-034 — connector tokens must expire and refresh, not live forever.</summary>
    public string? TokenEndpoint { get; set; }

    public int StaticBearerCacheSeconds { get; set; } = 300;

    public int ClockSkewSeconds { get; set; } = 30;
}

/// <summary>
/// OAuth2 client-credentials token provider with in-memory expiry cache.
/// When TokenEndpoint is unset, re-reads the secret periodically so rotation via ISecretsProvider works.
/// </summary>
public sealed class CachedAccessTokenProvider : IAccessTokenProvider
{
    private readonly ISecretsProvider _secrets;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ClientCredentialsOptions _options;
    private readonly ILogger<CachedAccessTokenProvider> _logger;
    private readonly ConcurrentDictionary<string, CachedToken> _cache = new(StringComparer.Ordinal);

    public CachedAccessTokenProvider(
        ISecretsProvider secrets,
        IHttpClientFactory httpClientFactory,
        Microsoft.Extensions.Options.IOptions<ClientCredentialsOptions> options,
        ILogger<CachedAccessTokenProvider> logger)
    {
        _secrets = secrets;
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(secretReference))
        {
            throw new InvalidOperationException("Secret reference is required for connector authentication.");
        }

        if (_cache.TryGetValue(secretReference, out var cached) && cached.ExpiresAtUtc > DateTimeOffset.UtcNow)
        {
            return cached.AccessToken;
        }

        string token;
        DateTimeOffset expiresAt;

        if (!string.IsNullOrWhiteSpace(_options.TokenEndpoint))
        {
            (token, expiresAt) = await RequestClientCredentialsAsync(secretReference, cancellationToken);
        }
        else
        {
            var secret = await _secrets.GetSecretAsync(secretReference, cancellationToken);
            if (string.IsNullOrWhiteSpace(secret))
            {
                throw new InvalidOperationException(
                    $"Secret '{secretReference}' could not be resolved. Connector calls are blocked until credentials are available.");
            }

            token = secret;
            expiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(30, _options.StaticBearerCacheSeconds));
            _logger.LogDebug(
                "Using rotated static bearer for {SecretReference}, refresh in {Seconds}s",
                secretReference,
                _options.StaticBearerCacheSeconds);
        }

        _cache[secretReference] = new CachedToken(token, expiresAt);
        return token;
    }

    private async Task<(string Token, DateTimeOffset ExpiresAt)> RequestClientCredentialsAsync(
        string secretReference,
        CancellationToken cancellationToken)
    {
        var clientId = await _secrets.GetSecretAsync($"{secretReference}:client-id", cancellationToken)
            ?? await _secrets.GetSecretAsync($"{secretReference}:client_id", cancellationToken);
        var clientSecret = await _secrets.GetSecretAsync(secretReference, cancellationToken);

        if (string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
        {
            throw new InvalidOperationException(
                $"Client credentials for '{secretReference}' are incomplete (need client-id + secret).");
        }

        var client = _httpClientFactory.CreateClient("i2p-oauth");
        using var request = new HttpRequestMessage(HttpMethod.Post, _options.TokenEndpoint);
        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["grant_type"] = "client_credentials"
        });

        using var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<TokenResponse>(stream, cancellationToken: cancellationToken)
            ?? throw new InvalidOperationException("Token endpoint returned an empty body.");

        if (string.IsNullOrWhiteSpace(payload.AccessToken))
        {
            throw new InvalidOperationException("Token endpoint did not return access_token.");
        }

        var lifetime = payload.ExpiresIn is > 0
            ? TimeSpan.FromSeconds(payload.ExpiresIn.Value - _options.ClockSkewSeconds)
            : TimeSpan.FromMinutes(5);

        if (lifetime < TimeSpan.FromSeconds(30))
        {
            lifetime = TimeSpan.FromSeconds(30);
        }

        return (payload.AccessToken, DateTimeOffset.UtcNow.Add(lifetime));
    }

    private sealed record CachedToken(string AccessToken, DateTimeOffset ExpiresAtUtc);

    private sealed class TokenResponse
    {
        [JsonPropertyName("access_token")]
        public string? AccessToken { get; set; }

        [JsonPropertyName("expires_in")]
        public int? ExpiresIn { get; set; }
    }
}
