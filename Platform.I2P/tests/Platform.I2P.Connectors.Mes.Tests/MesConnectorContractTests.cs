using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Mes;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Mes.Tests;

public class MesConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly MesConnector _connector;

    public MesConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server.Given(Request.Create().WithPath("/api/health").UsingGet()).RespondWith(Response.Create().WithStatusCode(200));
        _server.Given(Request.Create().WithPath("/api/workOrders").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody("""{"items":[{"id":"WO-1","orderNumber":"WO-1","status":"Running","timestamp":"2024-06-01T12:00:00Z","quality":"Good"}]}"""));
        var options = Options.Create(new MesConnectorOptions { BaseAddress = _server.Urls[0] + "/" });
        _connector = new MesConnector(new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") }, new MesAuthHandler(new FakeTokens(), options), options, NullLogger<MesConnector>.Instance);
    }

    [Fact]
    public async Task Maps_Contract()
    {
        var result = await _connector.GetWorkOrdersAsync(Guid.NewGuid()); result.Should().ContainSingle(x => x.ExternalId == "WO-1");
    }

    public void Dispose() => _server.Stop();
    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) => Task.FromResult("t");
    }
}
