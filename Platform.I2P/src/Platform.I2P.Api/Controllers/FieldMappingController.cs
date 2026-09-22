using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Commands.UpdateFieldMapping;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[Route("api/integration/mappings")]
public sealed class FieldMappingController : ControllerBase
{
    public const int ResponseTimeBudgetMs = 1000;

    private readonly IMediator _mediator;

    public FieldMappingController(IMediator mediator) => _mediator = mediator;

    [HttpPut("{mappingId:guid}")]
    [Authorize(Policy = I2PAuthPolicies.Admin)]
    public async Task<IActionResult> Update(
        Guid mappingId,
        [FromBody] UpdateFieldMappingRequest body,
        CancellationToken cancellationToken)
    {
        var id = await _mediator.Send(
            new UpdateFieldMappingCommand(
                mappingId,
                body.SourceField,
                body.TargetField,
                body.IsRequired,
                body.TransformExpression),
            cancellationToken);
        Response.Headers["X-Response-Time-Budget-Ms"] = ResponseTimeBudgetMs.ToString();
        return Ok(new { id });
    }
}

public sealed record UpdateFieldMappingRequest(
    string SourceField,
    string TargetField,
    bool IsRequired,
    string? TransformExpression);
