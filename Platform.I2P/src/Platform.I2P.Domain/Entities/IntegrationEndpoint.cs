namespace Platform.I2P.Domain.Entities;

public enum ConnectorType
{
    Erp = 0,
    Mes = 1,
    Cmms = 2,
    Gis = 3,
    Lims = 4
}

/// <summary>
/// One configured connection to an external system.
/// Project-specific endpoint details are configuration-driven (configuration over customization).
/// </summary>
public sealed class IntegrationEndpoint
{
    public Guid Id { get; private set; }
    public string TenantId { get; private set; }
    public string Name { get; private set; }
    public ConnectorType ConnectorType { get; private set; }
    public string BaseAddress { get; private set; }
    public string? SecretReference { get; private set; }
    public bool IsEnabled { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? UpdatedAtUtc { get; private set; }

    private IntegrationEndpoint()
    {
        TenantId = string.Empty;
        Name = string.Empty;
        BaseAddress = string.Empty;
    }

    private IntegrationEndpoint(
        Guid id,
        string tenantId,
        string name,
        ConnectorType connectorType,
        string baseAddress,
        string? secretReference,
        bool isEnabled,
        DateTimeOffset createdAtUtc)
    {
        Id = id;
        TenantId = tenantId;
        Name = name;
        ConnectorType = connectorType;
        BaseAddress = baseAddress;
        SecretReference = secretReference;
        IsEnabled = isEnabled;
        CreatedAtUtc = createdAtUtc;
    }

    public static IntegrationEndpoint Create(
        string tenantId,
        string name,
        ConnectorType connectorType,
        string baseAddress,
        string? secretReference = null,
        Guid? id = null,
        DateTimeOffset? createdAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(tenantId))
        {
            throw new ArgumentException("Tenant id is required.", nameof(tenantId));
        }

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new ArgumentException("Endpoint name is required.", nameof(name));
        }

        if (string.IsNullOrWhiteSpace(baseAddress))
        {
            throw new ArgumentException("Base address is required.", nameof(baseAddress));
        }

        if (!Uri.TryCreate(baseAddress, UriKind.Absolute, out _))
        {
            throw new ArgumentException("Base address must be an absolute URI.", nameof(baseAddress));
        }

        return new IntegrationEndpoint(
            id ?? Guid.NewGuid(),
            tenantId.Trim(),
            name.Trim(),
            connectorType,
            baseAddress.Trim(),
            string.IsNullOrWhiteSpace(secretReference) ? null : secretReference.Trim(),
            isEnabled: true,
            createdAtUtc ?? DateTimeOffset.UtcNow);
    }

    public bool BelongsToTenant(string tenantId) =>
        string.Equals(TenantId, tenantId, StringComparison.Ordinal);

    public void Disable(DateTimeOffset? updatedAtUtc = null)
    {
        IsEnabled = false;
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }

    public void Enable(DateTimeOffset? updatedAtUtc = null)
    {
        IsEnabled = true;
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }

    public void UpdateAddress(string baseAddress, DateTimeOffset? updatedAtUtc = null)
    {
        if (string.IsNullOrWhiteSpace(baseAddress))
        {
            throw new ArgumentException("Base address is required.", nameof(baseAddress));
        }

        if (!Uri.TryCreate(baseAddress, UriKind.Absolute, out _))
        {
            throw new ArgumentException("Base address must be an absolute URI.", nameof(baseAddress));
        }

        BaseAddress = baseAddress.Trim();
        UpdatedAtUtc = updatedAtUtc ?? DateTimeOffset.UtcNow;
    }
}
