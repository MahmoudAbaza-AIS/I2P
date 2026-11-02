using MassTransit;
using Microsoft.EntityFrameworkCore;
using Platform.I2P.Domain.Entities;

namespace Platform.I2P.Infrastructure.Persistence;

public sealed class I2PDbContext : DbContext
{
    public I2PDbContext(DbContextOptions<I2PDbContext> options) : base(options)
    {
    }

    public DbSet<IntegrationEndpoint> IntegrationEndpoints => Set<IntegrationEndpoint>();
    public DbSet<FieldMapping> FieldMappings => Set<FieldMapping>();
    public DbSet<SyncPolicy> SyncPolicies => Set<SyncPolicy>();
    public DbSet<ExchangeRecordEntity> ExchangeRecords => Set<ExchangeRecordEntity>();
    public DbSet<AuditRecord> AuditRecords => Set<AuditRecord>();
    public DbSet<DeadLetterOutboxEntry> DeadLetterOutboxEntries => Set<DeadLetterOutboxEntry>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<IntegrationEndpoint>(entity =>
        {
            entity.ToTable("IntegrationEndpoints");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(200).IsRequired();
            entity.Property(x => x.BaseAddress).HasMaxLength(1000).IsRequired();
            entity.Property(x => x.SecretReference).HasMaxLength(500);
            entity.Property(x => x.ConnectorType).HasConversion<string>().HasMaxLength(50);
            entity.HasIndex(x => new { x.TenantId, x.Name });
        });

        modelBuilder.Entity<FieldMapping>(entity =>
        {
            entity.ToTable("FieldMappings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            entity.Property(x => x.SourceField).HasMaxLength(200).IsRequired();
            entity.Property(x => x.TargetField).HasMaxLength(200).IsRequired();
            entity.Property(x => x.TransformExpression).HasMaxLength(200);
            entity.Property(x => x.ValidationState).HasConversion<string>().HasMaxLength(50);
            entity.Property(x => x.ValidationMessage).HasMaxLength(1000);
            entity.HasIndex(x => new { x.TenantId, x.EndpointId, x.SourceField, x.TargetField });
        });

        modelBuilder.Entity<SyncPolicy>(entity =>
        {
            entity.ToTable("SyncPolicies");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Mode).HasConversion<string>().HasMaxLength(50);
            entity.Property(x => x.CronExpression).HasMaxLength(100);
        });

        modelBuilder.Entity<ExchangeRecordEntity>(entity =>
        {
            entity.ToTable("ExchangeRecords");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.TenantId).HasMaxLength(100).IsRequired();
            entity.HasIndex(x => x.IdempotencyKey).IsUnique();
            entity.HasIndex(x => new { x.TenantId, x.ReceivedAtUtc });
            entity.Property(x => x.ExternalId).HasMaxLength(200).IsRequired();
            entity.Property(x => x.PayloadHash).HasMaxLength(128).IsRequired();
            entity.Property(x => x.IdempotencyKey).HasMaxLength(500).IsRequired();
            entity.Property(x => x.SourceSystem).HasMaxLength(100).IsRequired();
            entity.Property(x => x.QualityCode).HasMaxLength(50).IsRequired();
            entity.Property(x => x.TimestampOrigin).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => new { x.EndpointId, x.ExternalId, x.ReceivedAtUtc });
        });

        modelBuilder.Entity<AuditRecord>(entity =>
        {
            entity.ToTable("AuditRecords");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Actor).HasMaxLength(200).IsRequired();
        });

        modelBuilder.Entity<DeadLetterOutboxEntry>(entity =>
        {
            entity.ToTable("OutboxDeadLetters");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.MessageType).HasMaxLength(500).IsRequired();
            entity.Property(x => x.PayloadJson).IsRequired();
            entity.Property(x => x.LastError).HasMaxLength(4000);
            entity.Property(x => x.Status).HasMaxLength(50).IsRequired();
            entity.HasIndex(x => new { x.Status, x.FailedAtUtc });
        });

        // MassTransit EF transactional outbox + inbox (D1 option a)
        modelBuilder.AddInboxStateEntity();
        modelBuilder.AddOutboxMessageEntity();
        modelBuilder.AddOutboxStateEntity();
    }
}

/// <summary>Admin-visible dead-letter records when bus outbox delivery exhausts retries.</summary>
public sealed class DeadLetterOutboxEntry
{
    public Guid Id { get; set; }
    public Guid? OutboxMessageId { get; set; }
    public string MessageType { get; set; } = string.Empty;
    public string PayloadJson { get; set; } = string.Empty;
    public string? LastError { get; set; }
    public int AttemptCount { get; set; }
    public DateTimeOffset FailedAtUtc { get; set; }
    public string Status { get; set; } = DeadLetterStatuses.DeadLettered;
    public DateTimeOffset? RequeuedAtUtc { get; set; }
}

public static class DeadLetterStatuses
{
    public const string DeadLettered = "DeadLettered";
    public const string Requeued = "Requeued";
}
