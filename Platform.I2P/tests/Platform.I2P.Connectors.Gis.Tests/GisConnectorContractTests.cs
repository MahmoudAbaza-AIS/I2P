using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Gis;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Gis.Tests;

public class GisConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly GisConnector _connector;

    public GisConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server.Given(Request.Create().WithPath("/api/health").UsingGet()).RespondWith(Response.Create().WithStatusCode(200));
        _server.Given(Request.Create().WithPath("/api/features").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody("""{"features":[{"id":"F-1","geometry":"{\"type\":\"Point\"}","timestamp":"2024-06-01T12:00:00Z","quality":"Good"}]}"""));
        var options = Options.Create(new GisConnectorOptions { BaseAddress = _server.Urls[0] + "/" });
        _connector = new GisConnector(new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") }, new GisAuthHandler(new FakeTokens(), options), options, NullLogger<GisConnector>.Instance);
    }

    [Fact]
    public async Task Maps_Contract()
    {
        var result = await _connector.GetFeaturesAsync(Guid.NewGuid(), "assets"); result.Should().ContainSingle(x => x.LayerName == "assets");
    }

    public void Dispose() => _server.Stop();
    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) => Task.FromResult("t");
    }
}
