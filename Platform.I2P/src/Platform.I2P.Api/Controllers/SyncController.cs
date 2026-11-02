using System.Diagnostics;
using Asp.Versioning;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Commands.SyncErpPurchaseOrder;
using Platform.I2P.Application.Queries.GetExchangeHistory;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/integration/sync")]
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

    /// <summary>
    /// Trigger synchronization of a purchase order from SAP endpoint
    /// </summary>
    /// <param name="body">Sync request containing endpoint ID and optional PO number</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Sync result with status and affected records count</returns>
    [HttpPost("erp/purchase-orders")]
    [Authorize(Policy = I2PAuthPolicies.Operator)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
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

    /// <summary>
    /// Retrieve paginated history of all data synchronization operations
    /// </summary>
    /// <param name="page">Page number (1-indexed)</param>
    /// <param name="pageSize">Records per page (default 50, max 100)</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Paginated list of exchange history records</returns>
    [HttpGet("exchanges")]
    [Authorize(Policy = I2PAuthPolicies.Reader)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<IActionResult> GetExchangeHistory(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken cancellationToken = default)
    {
        var result = await _mediator.Send(new GetExchangeHistoryQuery(page, pageSize), cancellationToken);
        return Ok(result);
    }
}

/// <summary>
/// Represents a synchronization request for an ERP endpoint
/// </summary>
public sealed record SyncErpRequest(
    /// <summary>SAP endpoint identifier</summary>
    Guid EndpointId, 
    /// <summary>Optional purchase order number to sync; if null, syncs all pending</summary>
    string? PurchaseOrderNumber = null);

