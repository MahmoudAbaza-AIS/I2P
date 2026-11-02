using System.Diagnostics;
using Asp.Versioning;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Queries.GetIntegrationHealth;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/integration/health")]
public sealed class IntegrationHealthController : ControllerBase
{
    public const int ResponseTimeBudgetMs = 2000;

    private readonly IMediator _mediator;
    private readonly ILogger<IntegrationHealthController> _logger;

    public IntegrationHealthController(IMediator mediator, ILogger<IntegrationHealthController> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    /// <summary>
    /// Get real-time health status of all connectors and infrastructure dependencies
    /// </summary>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Integration health status including connector availability and response times</returns>
    [HttpGet]
    [Authorize(Policy = I2PAuthPolicies.Reader)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    [ProducesResponseType(StatusCodes.Status503ServiceUnavailable)]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var result = await _mediator.Send(new GetIntegrationHealthQuery(), cancellationToken);
        sw.Stop();
        _logger.LogInformation(
            "GetIntegrationHealth completed in {ElapsedMs}ms (budget {BudgetMs}ms)",
            sw.ElapsedMilliseconds,
            ResponseTimeBudgetMs);
        Response.Headers["X-Response-Time-Budget-Ms"] = ResponseTimeBudgetMs.ToString();
        return Ok(result);
    }
}

