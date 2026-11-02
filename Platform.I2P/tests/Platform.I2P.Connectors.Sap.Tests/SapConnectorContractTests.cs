using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Sap;
using Platform.I2P.Domain.ValueObjects;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Sap.Tests;

public class SapConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;

    public SapConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server
            .Given(Request.Create().WithPath("/api/health").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("{\"status\":\"ok\"}"));
    }

    [Fact]
    public async Task GetPurchaseOrders_Maps_Sap_OData_Contract()
    {
        _server
            .Given(Request.Create().WithPath("/api/purchaseOrders").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "value": [
                    {
                      "ebeln": "4500001234",
                      "lifnr": "VENDOR1",
                      "netwr": 1250.50,
                      "waers": "USD",
                      "aedat": "2024-06-01T12:00:00Z",
                      "quality": "Good"
                    }
                  ]
                }
                """));

        var connector = CreateConnector();
        var result = await connector.GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle();
        result.RejectedReasons.Should().BeEmpty();
        result.Accepted[0].Number.Should().Be("4500001234");
        result.Accepted[0].Vendor.Should().Be("VENDOR1");
        result.Accepted[0].Quality.Code.Should().Be(QualityCode.Good);
        result.Accepted[0].Timestamp.Origin.Should().Be(TimestampOrigin.Source);
    }

    [Fact]
    public async Task Missing_quality_maps_to_unknown_not_good()
    {
        _server
            .Given(Request.Create().WithPath("/api/purchaseOrders").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "value": [
                    {
                      "ebeln": "4500009999",
                      "lifnr": "VENDOR1",
                      "netwr": 10,
                      "waers": "EUR",
                      "aedat": "2024-06-01T12:00:00Z"
                    }
                  ]
                }
                """));

        var result = await CreateConnector().GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle();
        result.Accepted[0].Quality.Code.Should().Be(QualityCode.Unknown);
        result.Accepted[0].Quality.Reason.Should().Be("SourceDidNotProvideQuality");
    }

    [Fact]
    public async Task Missing_currency_is_rejected_not_defaulted()
    {
        _server
            .Given(Request.Create().WithPath("/api/purchaseOrders").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "value": [
                    {
                      "ebeln": "4500001111",
                      "lifnr": "VENDOR1",
                      "netwr": 10,
                      "aedat": "2024-06-01T12:00:00Z",
                      "quality": "Good"
                    },
                    {
                      "ebeln": "4500002222",
                      "lifnr": "VENDOR2",
                      "netwr": 20,
                      "waers": "USD",
                      "aedat": "2024-06-01T12:00:00Z",
                      "quality": "Good"
                    }
                  ]
                }
                """));

        var result = await CreateConnector().GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle(x => x.Number == "4500002222");
        result.RejectedReasons.Should().ContainSingle(r => r.Contains("WAERS", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Missing_required_field_rejects_record_and_continues_batch()
    {
        _server
            .Given(Request.Create().WithPath("/api/purchaseOrders").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "value": [
                    {
                      "ebeln": "4500003333",
                      "netwr": 10,
                      "waers": "USD",
                      "quality": "Good"
                    },
                    {
                      "ebeln": "4500004444",
                      "lifnr": "V2",
                      "netwr": 20,
                      "waers": "USD",
                      "aedat": "2024-06-02T00:00:00Z",
                      "quality": "Good"
                    }
                  ]
                }
                """));

        var result = await CreateConnector().GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle(x => x.Number == "4500004444");
        result.RejectedReasons.Should().ContainSingle(r => r.Contains("LIFNR", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Platform_timestamp_origin_is_preserved_in_event()
    {
        _server
            .Given(Request.Create().WithPath("/api/purchaseOrders").UsingGet())
            .RespondWith(Response.Create()
                .WithStatusCode(200)
                .WithHeader("Content-Type", "application/json")
                .WithBody("""
                {
                  "value": [
                    {
                      "ebeln": "4500005555",
                      "lifnr": "VENDOR1",
                      "netwr": 10,
                      "waers": "USD",
                      "quality": "Good"
                    }
                  ]
                }
                """));

        var result = await CreateConnector().GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle();
        result.Accepted[0].Timestamp.Origin.Should().Be(TimestampOrigin.Platform);
    }

    [Fact]
    public async Task GetHealth_Returns_Healthy_For_200()
    {
        var health = await CreateConnector().GetHealthAsync();
        health.IsHealthy.Should().BeTrue();
    }

    private SapConnector CreateConnector()
    {
        var options = Options.Create(new SapConnectorOptions
        {
            BaseAddress = _server.Urls[0] + "/",
            SecretReference = "sap:client-secret"
        });
        var auth = new SapAuthHandler(new FakeTokens(), options);
        var http = new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") };
        return new SapConnector(http, auth, options, NullLogger<SapConnector>.Instance);
    }

    public void Dispose() => _server.Stop();

    /// <summary>Synthetic test double — not production vendor credentials.</summary>
    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) =>
            Task.FromResult("test-token");
    }
}
