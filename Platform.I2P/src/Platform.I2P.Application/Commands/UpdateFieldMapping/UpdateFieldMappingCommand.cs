using FluentValidation;
using MediatR;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Domain.Exceptions;
using Platform.I2P.Domain.Rules;

namespace Platform.I2P.Application.Commands.UpdateFieldMapping;

public sealed record UpdateFieldMappingCommand(
    Guid MappingId,
    string SourceField,
    string TargetField,
    bool IsRequired,
    string? TransformExpression = null) : IRequest<Guid>;

public sealed class UpdateFieldMappingValidator : AbstractValidator<UpdateFieldMappingCommand>
{
    public UpdateFieldMappingValidator()
    {
        RuleFor(x => x.MappingId).NotEmpty();
        RuleFor(x => x.SourceField).NotEmpty();
        RuleFor(x => x.TargetField).NotEmpty();
    }
}

public sealed class UpdateFieldMappingHandler : IRequestHandler<UpdateFieldMappingCommand, Guid>
{
    private readonly IFieldMappingRepository _mappings;
    private readonly IAuditWriter _auditWriter;
    private readonly ICurrentUserContext _user;

    public UpdateFieldMappingHandler(
        IFieldMappingRepository mappings,
        IAuditWriter auditWriter,
        ICurrentUserContext user)
    {
        _mappings = mappings;
        _auditWriter = auditWriter;
        _user = user;
    }

    public async Task<Guid> Handle(UpdateFieldMappingCommand request, CancellationToken cancellationToken)
    {
        var mapping = await _mappings.GetByIdForTenantAsync(request.MappingId, _user.TenantId, cancellationToken)
            ?? throw new ForbiddenResourceException(
                $"Mapping '{request.MappingId}' was not found for the caller's tenant.",
                request.MappingId.ToString());

        mapping.Update(
            request.SourceField,
            request.TargetField,
            request.IsRequired,
            request.TransformExpression);

        var validation = MappingValidator.Validate(mapping);
        if (!validation.IsValid)
        {
            mapping.MarkInvalid(validation.ErrorMessage!);
            await _mappings.UpdateAsync(mapping, cancellationToken);
            throw new InvalidMappingException(validation.ErrorMessage!, mapping.Id.ToString());
        }

        mapping.MarkValid();
        await _mappings.UpdateAsync(mapping, cancellationToken);

        await _auditWriter.WriteAsync(
            "FieldMappingChanged",
            _user.Subject,
            $"Mapping {mapping.Id} updated to {mapping.SourceField}->{mapping.TargetField}",
            cancellationToken);

        return mapping.Id;
    }
}
