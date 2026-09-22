using System.Text.RegularExpressions;
using Platform.I2P.Domain.Entities;

namespace Platform.I2P.Domain.Rules;

/// <summary>
/// Pure mapping validation against configured constraints (NFR-CFG-004/023/024).
/// </summary>
public static class MappingValidator
{
    private static readonly Regex FieldNamePattern = new(
        @"^[A-Za-z_][A-Za-z0-9_\.]*$",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly HashSet<string> AllowedTransforms = new(StringComparer.OrdinalIgnoreCase)
    {
        "none",
        "trim",
        "toupper",
        "tolower",
        "tostring"
    };

    public static MappingValidationResult Validate(FieldMapping mapping, IReadOnlyCollection<string>? reservedTargetFields = null)
    {
        ArgumentNullException.ThrowIfNull(mapping);

        if (!FieldNamePattern.IsMatch(mapping.SourceField))
        {
            return MappingValidationResult.Invalid(
                $"Source field '{mapping.SourceField}' is not a valid identifier.");
        }

        if (!FieldNamePattern.IsMatch(mapping.TargetField))
        {
            return MappingValidationResult.Invalid(
                $"Target field '{mapping.TargetField}' is not a valid identifier.");
        }

        if (reservedTargetFields is not null &&
            reservedTargetFields.Contains(mapping.TargetField, StringComparer.OrdinalIgnoreCase))
        {
            return MappingValidationResult.Invalid(
                $"Target field '{mapping.TargetField}' is reserved and cannot be mapped.");
        }

        if (!string.IsNullOrWhiteSpace(mapping.TransformExpression) &&
            !AllowedTransforms.Contains(mapping.TransformExpression))
        {
            return MappingValidationResult.Invalid(
                $"Transform '{mapping.TransformExpression}' is not in the allowed set.");
        }

        return MappingValidationResult.Valid();
    }
}

public sealed class MappingValidationResult
{
    public bool IsValid { get; }
    public string? ErrorMessage { get; }

    private MappingValidationResult(bool isValid, string? errorMessage)
    {
        IsValid = isValid;
        ErrorMessage = errorMessage;
    }

    public static MappingValidationResult Valid() => new(true, null);

    public static MappingValidationResult Invalid(string message) =>
        new(false, message);
}
