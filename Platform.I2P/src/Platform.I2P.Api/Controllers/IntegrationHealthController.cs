using System.Diagnostics;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Queries.GetIntegrationHealth;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[Route("api/integration/health")]
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

    [HttpGet]
    [Authorize(Policy = I2PAuthPolicies.Reader)]
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
