using Platform.I2P.Application.Ports;

namespace Platform.I2P.Infrastructure.Persistence;

public sealed class EfUnitOfWork : IUnitOfWork
{
    private readonly I2PDbContext _db;

    public EfUnitOfWork(I2PDbContext db) => _db = db;

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken = default) =>
        _db.SaveChangesAsync(cancellationToken);
}
