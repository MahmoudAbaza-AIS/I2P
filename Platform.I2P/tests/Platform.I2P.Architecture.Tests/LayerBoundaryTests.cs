using NetArchTest.Rules;
using Platform.I2P.Application;
using Platform.I2P.Connectors.Cmms;
using Platform.I2P.Connectors.Gis;
using Platform.I2P.Connectors.Lims;
using Platform.I2P.Connectors.Mes;
using Platform.I2P.Connectors.Sap;
using Platform.I2P.Domain.Entities;
using Platform.I2P.Infrastructure.Persistence;

namespace Platform.I2P.Architecture.Tests;

public class LayerBoundaryTests
{
    private static readonly string[] ForbiddenDomainPrefixes =
    [
        "Microsoft.EntityFrameworkCore",
        "Microsoft.AspNetCore",
        "MassTransit",
        "System.Data",
        "Dapper",
        "Polly",
        "Serilog",
        "Platform.I2P.Application",
        "Platform.I2P.Infrastructure",
        "Platform.I2P.Connectors",
        "Platform.I2P.Api",
        "Platform.I2P.Contracts"
    ];

    [Fact]
    public void Domain_Should_Not_Reference_NonBcl_Assemblies()
    {
        var domainAssembly = typeof(IntegrationEndpoint).Assembly;

        var result = Types.InAssembly(domainAssembly)
            .ShouldNot()
            .HaveDependencyOnAny(ForbiddenDomainPrefixes)
            .GetResult();

        Assert.True(
            result.IsSuccessful,
            "Platform.I2P.Domain must only depend on the .NET BCL. Offenders: " +
            string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>()));

        var referencedNames = domainAssembly.GetReferencedAssemblies().Select(a => a.Name!).ToArray();
        var forbiddenRefs = referencedNames
            .Where(name => ForbiddenDomainPrefixes.Any(prefix =>
                name.Equals(prefix, StringComparison.OrdinalIgnoreCase) ||
                name.StartsWith(prefix + ".", StringComparison.OrdinalIgnoreCase)))
            .ToArray();

        Assert.True(
            forbiddenRefs.Length == 0,
            "Domain project references forbidden assemblies: " + string.Join(", ", forbiddenRefs));
    }

    [Fact]
    public void Connectors_Should_Only_Be_Referenced_By_Api_Composition_Root()
    {
        var forbiddenConsumers = new[]
        {
            typeof(IntegrationEndpoint).Assembly,
            typeof(Platform.I2P.Application.DependencyInjection).Assembly,
            typeof(I2PDbContext).Assembly,
            typeof(Platform.I2P.Contracts.Dtos.PurchaseOrderDto).Assembly
        };

        foreach (var consumer in forbiddenConsumers)
        {
            var connectorDeps = consumer.GetReferencedAssemblies()
                .Select(a => a.Name!)
                .Where(n => n.StartsWith("Platform.I2P.Connectors", StringComparison.OrdinalIgnoreCase))
                .ToArray();

            Assert.True(
                connectorDeps.Length == 0,
                $"{consumer.GetName().Name} must not reference connector projects. Found: {string.Join(", ", connectorDeps)}");
        }

        var apiAssembly = typeof(Platform.I2P.Api.Program).Assembly;
        var apiConnectorDeps = apiAssembly.GetReferencedAssemblies()
            .Select(a => a.Name!)
            .Where(n => n.StartsWith("Platform.I2P.Connectors", StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n)
            .ToArray();

        Assert.Contains("Platform.I2P.Connectors.Sap", apiConnectorDeps);
        Assert.Contains("Platform.I2P.Connectors.Mes", apiConnectorDeps);
        Assert.Contains("Platform.I2P.Connectors.Cmms", apiConnectorDeps);
        Assert.Contains("Platform.I2P.Connectors.Gis", apiConnectorDeps);
        Assert.Contains("Platform.I2P.Connectors.Lims", apiConnectorDeps);
    }

    [Fact]
    public void Application_Should_Not_Depend_On_Infrastructure_Or_Api()
    {
        var result = Types.InAssembly(typeof(Platform.I2P.Application.DependencyInjection).Assembly)
            .ShouldNot()
            .HaveDependencyOnAny(
                "Platform.I2P.Infrastructure",
                "Platform.I2P.Api",
                "Platform.I2P.Connectors.Sap",
                "Platform.I2P.Connectors.Mes",
                "Platform.I2P.Connectors.Cmms",
                "Platform.I2P.Connectors.Gis",
                "Platform.I2P.Connectors.Lims")
            .GetResult();

        Assert.True(result.IsSuccessful, string.Join(", ", result.FailingTypeNames ?? Array.Empty<string>()));
    }

    [Fact]
    public void Connector_Assemblies_Exist_For_Boundary_Checks()
    {
        Assert.NotNull(typeof(SapConnector).Assembly);
        Assert.NotNull(typeof(MesConnector).Assembly);
        Assert.NotNull(typeof(CmmsConnector).Assembly);
        Assert.NotNull(typeof(GisConnector).Assembly);
        Assert.NotNull(typeof(LimsConnector).Assembly);
    }
}
