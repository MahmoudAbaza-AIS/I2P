using Asp.Versioning;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Platform.I2P.Application.Commands.UpdateFieldMapping;
using Platform.I2P.Application.Security;

namespace Platform.I2P.Api.Controllers;

[ApiController]
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/integration/mappings")]
public sealed class FieldMappingController : ControllerBase
{
    public const int ResponseTimeBudgetMs = 1000;

    private readonly IMediator _mediator;

    public FieldMappingController(IMediator mediator) => _mediator = mediator;

    /// <summary>
    /// Update a field mapping for data transformation between external system and Platform I2P
    /// </summary>
    /// <param name="mappingId">Unique identifier of the mapping to update</param>
    /// <param name="body">Mapping configuration with source/target fields and optional transform expression</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>ID of the updated mapping</returns>
    [HttpPut("{mappingId:guid}")]
    [Authorize(Policy = I2PAuthPolicies.Admin)]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
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

/// <summary>
/// Request to update field mapping configuration
/// </summary>
public sealed record UpdateFieldMappingRequest(
    /// <summary>Source system field path (dot-notation supported)</summary>
    string SourceField,
    /// <summary>Target domain model field path</summary>
    string TargetField,
    /// <summary>Whether field is required (fail sync if missing)</summary>
    bool IsRequired,
    /// <summary>Optional JMESPath expression for data transformation</summary>
    string? TransformExpression);

