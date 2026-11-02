using Asp.Versioning;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Security;
using Platform.I2P.Infrastructure.Messaging;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/integration/outbox/dead-letters")]
[Authorize(Policy = I2PAuthPolicies.Admin)]
public sealed class OutboxDeadLetterController : ControllerBase
{
    private readonly IDeadLetterOutboxService _deadLetters;

    public OutboxDeadLetterController(IDeadLetterOutboxService deadLetters) => _deadLetters = deadLetters;

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<DeadLetterOutboxEntry>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DeadLetterOutboxEntry>>> List(CancellationToken cancellationToken)
    {
        var items = await _deadLetters.ListAsync(cancellationToken);
        return Ok(items);
    }

    [HttpPost("{id:guid}/requeue")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Requeue(Guid id, CancellationToken cancellationToken)
    {
        try
        {
            var actor = User.FindFirst(I2PAuthPolicies.ClaimTypes.Subject)?.Value ?? "admin";
            await _deadLetters.RequeueAsync(id, actor, cancellationToken);
            return NoContent();
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("was not found", StringComparison.Ordinal))
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
    }
}
