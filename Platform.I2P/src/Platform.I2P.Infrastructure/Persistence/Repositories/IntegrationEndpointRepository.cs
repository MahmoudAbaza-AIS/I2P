using Microsoft.EntityFrameworkCore;
using Platform.I2P.Application.Ports;
using Platform.I2P.Domain.Entities;

namespace Platform.I2P.Infrastructure.Persistence.Repositories;

public sealed class IntegrationEndpointRepository : IIntegrationEndpointRepository
{
    private readonly I2PDbContext _db;

    public IntegrationEndpointRepository(I2PDbContext db) => _db = db;

    public Task<IntegrationEndpoint?> GetByIdForTenantAsync(
        Guid id,
        string tenantId,
        CancellationToken cancellationToken = default) =>
        _db.IntegrationEndpoints.FirstOrDefaultAsync(
            x => x.Id == id && x.TenantId == tenantId,
            cancellationToken);

    public async Task<IReadOnlyList<IntegrationEndpoint>> GetAllForTenantAsync(
        string tenantId,
        CancellationToken cancellationToken = default) =>
        await _db.IntegrationEndpoints.AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .ToListAsync(cancellationToken);

    public async Task AddAsync(IntegrationEndpoint endpoint, CancellationToken cancellationToken = default)
    {
        _db.IntegrationEndpoints.Add(endpoint);
        await _db.SaveChangesAsync(cancellationToken);
    }
}

public sealed class FieldMappingRepository : IFieldMappingRepository
{
    private readonly I2PDbContext _db;

    public FieldMappingRepository(I2PDbContext db) => _db = db;

    public Task<FieldMapping?> GetByIdForTenantAsync(
        Guid id,
        string tenantId,
        CancellationToken cancellationToken = default) =>
        _db.FieldMappings.FirstOrDefaultAsync(
            x => x.Id == id && x.TenantId == tenantId,
            cancellationToken);

    public async Task AddAsync(FieldMapping mapping, CancellationToken cancellationToken = default)
    {
        _db.FieldMappings.Add(mapping);
        await _db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(FieldMapping mapping, CancellationToken cancellationToken = default)
    {
        _db.FieldMappings.Update(mapping);
        await _db.SaveChangesAsync(cancellationToken);
    }
}

public sealed class ExchangeRecordRepository : IExchangeRecordRepository
{
    private readonly I2PDbContext _db;

    public ExchangeRecordRepository(I2PDbContext db) => _db = db;

    public Task<bool> ExistsByIdempotencyKeyAsync(string idempotencyKey, CancellationToken cancellationToken = default) =>
        _db.ExchangeRecords.AnyAsync(x => x.IdempotencyKey == idempotencyKey, cancellationToken);

    public Task AddAsync(ExchangeRecord record, CancellationToken cancellationToken = default)
    {
        _db.ExchangeRecords.Add(ExchangeRecordEntity.FromDomain(record));
        return Task.CompletedTask;
    }

    public async Task<IReadOnlyList<ExchangeRecord>> GetPagedForTenantAsync(
        string tenantId,
        int page,
        int pageSize,
        CancellationToken cancellationToken = default)
    {
        var entities = await _db.ExchangeRecords.AsNoTracking()
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.ReceivedAtUtc)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        return entities.Select(x => x.ToDomain()).ToList();
    }

    public Task<int> CountForTenantAsync(string tenantId, CancellationToken cancellationToken = default) =>
        _db.ExchangeRecords.CountAsync(x => x.TenantId == tenantId, cancellationToken);
}

public sealed class EfAuditWriter : IAuditWriter
{
    private readonly I2PDbContext _db;

    public EfAuditWriter(I2PDbContext db) => _db = db;

    public Task WriteAsync(string action, string actor, string details, CancellationToken cancellationToken = default)
    {
        _db.AuditRecords.Add(new AuditRecord
        {
            Id = Guid.NewGuid(),
            Action = action,
            Actor = actor,
            Details = details,
            CreatedAtUtc = DateTimeOffset.UtcNow
        });
        return Task.CompletedTask;
    }
}
