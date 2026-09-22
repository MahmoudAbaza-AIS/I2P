using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Platform.I2P.Infrastructure.Persistence;

public sealed class I2PDbContextFactory : IDesignTimeDbContextFactory<I2PDbContext>
{
    public I2PDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<I2PDbContext>()
            .UseSqlServer("Server=(localdb)\\MSSQLLocalDB;Database=PlatformI2P_Design;Trusted_Connection=True;TrustServerCertificate=True;")
            .Options;
        return new I2PDbContext(options);
    }
}
