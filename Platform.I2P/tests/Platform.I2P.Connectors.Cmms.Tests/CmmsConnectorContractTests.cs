using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Cmms;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Cmms.Tests;

public class CmmsConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly CmmsConnector _connector;

    public CmmsConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server.Given(Request.Create().WithPath("/api/health").UsingGet()).RespondWith(Response.Create().WithStatusCode(200));
        _server.Given(Request.Create().WithPath("/api/workOrders").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody("""{"items":[{"id":"CM-1","workOrderNumber":"CM-1","assetId":"A-9","timestamp":"2024-06-01T12:00:00Z","quality":"Good"}]}"""));
        var options = Options.Create(new CmmsConnectorOptions { BaseAddress = _server.Urls[0] + "/" });
        _connector = new CmmsConnector(new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") }, new CmmsAuthHandler(new FakeTokens(), options), options, NullLogger<CmmsConnector>.Instance);
    }

    [Fact]
    public async Task Maps_Contract()
    {
        var result = await _connector.GetWorkOrdersAsync(Guid.NewGuid());
        result.Accepted.Should().ContainSingle(x => x.AssetId == "A-9");
        result.RejectedReasons.Should().BeEmpty();
    }

    public void Dispose() => _server.Stop();
    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) => Task.FromResult("t");
    }
}
