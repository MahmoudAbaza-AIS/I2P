using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Platform.I2P.Application.Security;
using Platform.I2P.Connectors.Lims;
using WireMock.RequestBuilders;
using WireMock.ResponseBuilders;
using WireMock.Server;

namespace Platform.I2P.Connectors.Lims.Tests;

public class LimsConnectorContractTests : IDisposable
{
    private readonly WireMockServer _server;
    private readonly LimsConnector _connector;

    public LimsConnectorContractTests()
    {
        _server = WireMockServer.Start();
        _server.Given(Request.Create().WithPath("/api/health").UsingGet()).RespondWith(Response.Create().WithStatusCode(200));
        _server.Given(Request.Create().WithPath("/api/samples").UsingGet())
            .RespondWith(Response.Create().WithStatusCode(200).WithHeader("Content-Type", "application/json")
                .WithBody("""{"samples":[{"id":"S-1","sampleId":"S-1","analyte":"pH","result":"7.1","timestamp":"2024-06-01T12:00:00Z","quality":"Good"}]}"""));
        var options = Options.Create(new LimsConnectorOptions { BaseAddress = _server.Urls[0] + "/" });
        _connector = new LimsConnector(new HttpClient { BaseAddress = new Uri(_server.Urls[0] + "/") }, new LimsAuthHandler(new FakeTokens(), options), options, NullLogger<LimsConnector>.Instance);
    }

    [Fact]
    public async Task Maps_Contract()
    {
        var result = await _connector.GetSamplesAsync(Guid.NewGuid()); result.Should().ContainSingle(x => x.Analyte == "pH");
    }

    public void Dispose() => _server.Stop();
    private sealed class FakeTokens : IAccessTokenProvider
    {
        public Task<string> GetAccessTokenAsync(string secretReference, CancellationToken cancellationToken = default) => Task.FromResult("t");
    }
}
