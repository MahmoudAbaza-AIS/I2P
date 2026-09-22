using System.Diagnostics;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Commands.SyncErpPurchaseOrder;
using Platform.I2P.Application.Queries.GetExchangeHistory;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[Route("api/integration/sync")]
public sealed class SyncController : ControllerBase
{
    public const int ResponseTimeBudgetMs = 5000;

    private readonly IMediator _mediator;
    private readonly ILogger<SyncController> _logger;

    public SyncController(IMediator mediator, ILogger<SyncController> logger)
    {
        _mediator = mediator;
        _logger = logger;
    }

    [HttpPost("erp/purchase-orders")]
    [Authorize(Policy = I2PAuthPolicies.Operator)]
    public async Task<IActionResult> SyncErpPurchaseOrders(
        [FromBody] SyncErpRequest body,
        CancellationToken cancellationToken)
    {
        var sw = Stopwatch.StartNew();
        var result = await _mediator.Send(
            new SyncErpPurchaseOrderCommand(body.EndpointId, body.PurchaseOrderNumber),
            cancellationToken);
        sw.Stop();
        _logger.LogInformation(
            "SyncErpPurchaseOrders completed in {ElapsedMs}ms (budget {BudgetMs}ms)",
            sw.ElapsedMilliseconds,
            ResponseTimeBudgetMs);
        Response.Headers["X-Response-Time-Budget-Ms"] = ResponseTimeBudgetMs.ToString();
        return Ok(result);
    }

    [HttpGet("exchanges")]
    [Authorize(Policy = I2PAuthPolicies.Reader)]
    public async Task<IActionResult> GetExchangeHistory(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        var result = await _mediator.Send(new GetExchangeHistoryQuery(page, pageSize), cancellationToken);
        return Ok(result);
    }
}

public sealed record SyncErpRequest(Guid EndpointId, string? PurchaseOrderNumber = null);
