using Platform.I2P.Domain.Exceptions;

namespace Platform.I2P.Domain.Entities;

public enum MappingValidationState
{
    Pending = 0,
    Valid = 1,
    Invalid = 2
}

/// <summary>
/// Rule for translating a source system field into an internal tag/field.
/// </summary>
public sealed class FieldMapping
{
    public Guid Id { get; private set; }
    public string TenantId { get; private set; }
    public Guid EndpointId { get; private set; }
    public string SourceField { get; private set; }
    public string TargetField { get; private set; }
    public string? TransformExpression { get; private set; }
    public bool IsRequired { get; private set; }
    public MappingValidationState ValidationState { get; private set; }
    public string? ValidationMessage { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }

    private FieldMapping()
    {
        TenantId = string.Empty;
        SourceField = string.Empty;
        TargetField = string.Empty;
    }

    private FieldMapping(
        Guid id,
        string tenantId,
        Guid endpointId,
        string sourceField,
        string targetField,
        string? transformExpression,
        bool isRequired,
        MappingValidationState validationState,
        string? validationMessage,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        TenantId = tenantId;
        EndpointId = endpointId;
        SourceField = sourceField;
        TargetField = targetField;
        TransformExpression = transformExpression;
        IsRequired = isRequired;
        ValidationState = validationState;
        ValidationMessage = validationMessage;
        CreatedAtUtc = createdAtUtc;
    }

    public static FieldMapping Create(
        string tenantId,
        Guid endpointId,
        string sourceField,
        string targetField,
        bool isRequired = false,
        string? transformExpression = null,
        Guid? id = null,
        DateTimeOffset? createdAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        }

        if (endpointId == Guid.Empty)
        {
            throw new ArgumentException("Endpoint id is required.", nameof(endpointId));
        }

        if (string.IsNullOrWhiteSpace(sourceField))
        {
            throw new ArgumentException("Source field is required.", nameof(sourceField));
        }

        if (string.IsNullOrWhiteSpace(targetField))
        {
            throw new ArgumentException("Target field is required.", nameof(targetField));
        }

        return new FieldMapping(
            id ?? Guid.NewGuid(),
            tenantId.Trim(),
            endpointId,
            sourceField.Trim(),
            targetField.Trim(),
            string.IsNullOrWhiteSpace(transformExpression) ? null : transformExpression.Trim(),
            isRequired,
            MappingValidationState.Pending,
            null,
            createdAtUtc ?? DateTimeOffset.UtcNow);
    }

    public bool BelongsToTenant(string tenantId) =>
        string.Equals(TenantId, tenantId, StringComparison.Ordinal);

    public void Update(
        string sourceField,
        string targetField,
        bool isRequired,
        string? transformExpression = null,
        DateTimeOffset? updatedAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(sourceField))
        {
            throw new InvalidMappingException("Source field is required.", Id.ToString());
        }

        if (string.IsNullOrWhiteSpace(targetField))
        {
            throw new InvalidMappingException("Target field is required.", Id.ToString());
        }

        SourceField = sourceField.Trim();
        TargetField = targetField.Trim();
        IsRequired = isRequired;
        TransformExpression = string.IsNullOrWhiteSpace(transformExpression) ? null : transformExpression.Trim();
        ValidationState = MappingValidationState.Pending;
        ValidationMessage = null;
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }

    public void MarkValid(DateTimeOffset? updatedAtUtc = null)
    {
        ValidationState = MappingValidationState.Valid;
        ValidationMessage = null;
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }

    public void MarkInvalid(string message, DateTimeOffset? updatedAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(message))
        {
            throw new ArgumentException("Validation message is required.", nameof(message));
        }

        ValidationState = MappingValidationState.Invalid;
        ValidationMessage = message.Trim();
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }
}
