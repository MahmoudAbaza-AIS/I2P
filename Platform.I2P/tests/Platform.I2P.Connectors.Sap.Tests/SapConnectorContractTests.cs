using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Sap;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Sap.Tests;

public class SapConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly SapConnector _connector;

    public SapConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server
            .Given(Request.Create().WithPath("/api/health").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithBody("{\"status\":\"ok\"}"));

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

        var options = Options.Create(new SapConnectorOptions
        {
            BaseAddress = _server.Urls[0] + "/",
            SecretReference = "sap:client-secret"
        });

        var auth = new SapAuthHandler(new FakeTokens(), options);
        var http = new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") };
        _connector = new SapConnector(http, auth, options, NullLogger<SapConnector>.Instance);
    }

    [Fact]
    public async Task GetPurchaseOrders_Maps_Sap_OData_Contract()
    {
        var result = await _connector.GetPurchaseOrdersAsync(Guid.NewGuid());
        result.Should().ContainSingle();
        result[0].Number.Should().Be("4500001234");
        result[0].Vendor.Should().Be("VENDOR1");
        result[0].Quality.Code.Should().Be(Domain.ValueObjects.QualityCode.Good);
        result[0].Timestamp.Origin.Should().Be(Domain.ValueObjects.TimestampOrigin.Source);
    }

    [Fact]
    public async Task GetHealth_Returns_Healthy_For_200()
    {
        var health = await _connector.GetHealthAsync();
        health.IsHealthy.Should().BeTrue();
    }

    public void Dispose() => _server.Stop();

    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) =>
            Task.FromResult("test-token");
    }
}
