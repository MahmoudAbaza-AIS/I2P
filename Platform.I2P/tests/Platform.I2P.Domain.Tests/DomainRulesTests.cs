using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.Rules;
using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Domain.Tests;

public class QualityTests
{
    [Fact]
    public void Good_Has_Good_Code()
    {
        var quality = Quality.Good();
        Assert.Equal(QualityCode.Good, quality.Code);
        Assert.Null(quality.Reason);
    }

    [Theory]
    [InlineData(QualityCode.Uncertain)]
    [InlineData(QualityCode.Bad)]
    [InlineData(QualityCode.Unknown)]
    public void FromCode_Preserves_Code(QualityCode code)
    {
        var quality = Quality.FromCode(code, "reason");
        Assert.Equal(code, quality.Code);
        Assert.Equal("reason", quality.Reason);
    }
}

public class OperationalTimestampTests
{
    [Fact]
    public void FromSource_Marks_Source_Origin()
    {
        var ts = OperationalTimestamp.FromSource(DateTimeOffset.Parse("2024-01-01T00:00:00Z"));
        Assert.Equal(TimestampOrigin.Source, ts.Origin);
        Assert.Equal(DateTimeOffset.Parse("2024-01-01T00:00:00Z"), ts.Value);
    }

    [Fact]
    public void FromPlatform_Marks_Platform_Origin()
    {
        var ts = OperationalTimestamp.FromPlatform();
        Assert.Equal(TimestampOrigin.Platform, ts.Origin);
    }

    [Fact]
    public void Default_Value_Is_Rejected()
    {
        Assert.Throws<ArgumentException>(() => OperationalTimestamp.FromSource(default));
    }
}

public class IntegrationEndpointTests
{
    [Fact]
    public void Create_Requires_Absolute_Uri()
    {
        Assert.Throws<ArgumentException>(() =>
            IntegrationEndpoint.Create("tenant-a", "ERP", ConnectorType.Erp, "not-a-uri"));
    }

    [Fact]
    public void Disable_Sets_Enabled_False()
    {
        var endpoint = IntegrationEndpoint.Create("tenant-a", "ERP", ConnectorType.Erp, "https://erp.example/");
        endpoint.Disable();
        Assert.False(endpoint.IsEnabled);
        Assert.True(endpoint.BelongsToTenant("tenant-a"));
    }
}

public class FieldMappingTests
{
    [Fact]
    public void Update_Resets_Validation_To_Pending()
    {
        var mapping = FieldMapping.Create("tenant-a", Guid.NewGuid(), "PoNumber", "PurchaseOrderNumber");
        mapping.MarkValid();
        mapping.Update("PoNumber", "PurchaseOrderNumber", true);
        Assert.Equal(MappingValidationState.Pending, mapping.ValidationState);
    }
}

public class SyncPolicyTests
{
    [Fact]
    public void Scheduled_Requires_Cron()
    {
        Assert.Throws<ArgumentException>(() =>
            SyncPolicy.Create(
                Guid.NewGuid(),
                SyncMode.Scheduled,
                maxRetryCount: 3,
                retryBackoff: TimeSpan.FromSeconds(2),
                requestTimeout: TimeSpan.FromSeconds(30)));
    }

    [Fact]
    public void EventDriven_Does_Not_Require_Cron()
    {
        var policy = SyncPolicy.Create(
            Guid.NewGuid(),
            SyncMode.EventDriven,
            maxRetryCount: 3,
            retryBackoff: TimeSpan.FromSeconds(2),
            requestTimeout: TimeSpan.FromSeconds(30));

        Assert.True(policy.IsActive);
        Assert.Null(policy.CronExpression);
    }
}

public class ExchangeRecordTests
{
    [Fact]
    public void IdempotencyKey_Includes_Tenant()
    {
        var endpointId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        var record = ExchangeRecord.Create(
            "tenant-a",
            endpointId,
            "PO-1",
            "abc",
            "{\"id\":\"PO-1\"}",
            OperationalTimestamp.FromSource(DateTimeOffset.UtcNow),
            Quality.Good(),
            "SAP");

        Assert.Equal($"tenant-a:{endpointId:N}:PO-1:abc", record.IdempotencyKey);
    }
}

public class IdempotencyCheckerTests
{
    [Fact]
    public void Detects_Duplicate_By_Key()
    {
        var endpointId = Guid.NewGuid();
        var first = ExchangeRecord.Create(
            "tenant-a",
            endpointId,
            "PO-1",
            "hash",
            "{}",
            OperationalTimestamp.FromPlatform(),
            Quality.Good(),
            "SAP");
        var second = ExchangeRecord.Create(
            "tenant-a",
            endpointId,
            "PO-1",
            "hash",
            "{}",
            OperationalTimestamp.FromPlatform(),
            Quality.Good(),
            "SAP");

        Assert.True(IdempotencyChecker.IsDuplicate(second, [first]));
    }

    [Fact]
    public void Allows_Different_Payload_Hash()
    {
        var endpointId = Guid.NewGuid();
        var first = ExchangeRecord.Create(
            "tenant-a",
            endpointId,
            "PO-1",
            "hash-a",
            "{}",
            OperationalTimestamp.FromPlatform(),
            Quality.Good(),
            "SAP");
        var second = ExchangeRecord.Create(
            "tenant-a",
            endpointId,
            "PO-1",
            "hash-b",
            "{}",
            OperationalTimestamp.FromPlatform(),
            Quality.Good(),
            "SAP");

        Assert.False(IdempotencyChecker.IsDuplicate(second, [first]));
    }
}

public class MappingValidatorTests
{
    [Fact]
    public void Accepts_Valid_Mapping()
    {
        var mapping = FieldMapping.Create("tenant-a", Guid.NewGuid(), "PoNumber", "PurchaseOrderNumber", transformExpression: "trim");
        var result = MappingValidator.Validate(mapping);
        Assert.True(result.IsValid);
    }

    [Fact]
    public void Rejects_Invalid_Field_Name()
    {
        var mapping = FieldMapping.Create("tenant-a", Guid.NewGuid(), "bad field", "PurchaseOrderNumber");
        var result = MappingValidator.Validate(mapping);
        Assert.False(result.IsValid);
        Assert.Contains("Source field", result.ErrorMessage);
    }

    [Fact]
    public void Rejects_Reserved_Target()
    {
        var mapping = FieldMapping.Create("tenant-a", Guid.NewGuid(), "PoNumber", "Id");
        var result = MappingValidator.Validate(mapping, ["Id"]);
        Assert.False(result.IsValid);
    }
}
