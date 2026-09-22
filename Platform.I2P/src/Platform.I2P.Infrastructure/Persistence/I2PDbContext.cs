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
    public DbSet<OutboxMessage> OutboxMessages => Set<OutboxMessage>();
    public DbSet<AuditRecord> AuditRecords => Set<AuditRecord>();

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
        });

        modelBuilder.Entity<OutboxMessage>(entity =>
        {
            entity.ToTable("OutboxMessages");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.Status, x.CreatedAtUtc });
            entity.Property(x => x.TypeName).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Status).HasMaxLength(50).IsRequired();
        });

        modelBuilder.Entity<AuditRecord>(entity =>
        {
            entity.ToTable("AuditRecords");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Action).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Actor).HasMaxLength(200).IsRequired();
        });
    }
}
