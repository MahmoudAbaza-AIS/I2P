using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Platform.I2P.Application.Commands.SyncErpPurchaseOrder;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Domain.Entities;
using Platform.I2P.Domain.ValueObjects;

namespace Platform.I2P.Application.Tests;

public class SyncErpPurchaseOrderHandlerTests
{
    private static ICurrentUserContext User(string tenant = "tenant-a")
    {
        var user = Substitute.For<ICurrentUserContext>();
        user.TenantId.Returns(tenant);
        user.Subject.Returns("user-1");
        user.IsAuthenticated.Returns(true);
        return user;
    }

    [Fact]
    public async Task Handle_Persists_And_Publishes_New_Purchase_Orders()
    {
        var endpoint = IntegrationEndpoint.Create("tenant-a", "SAP-Main", ConnectorType.Erp, "https://sap.example/");
        var erp = Substitute.For<IErpConnector>();
        erp.ConnectorName.Returns("SAP");
        erp.GetPurchaseOrdersAsync(endpoint.Id, null, Arg.Any<CancellationToken>())
            .Returns(new ConnectorBatchResult<PurchaseOrderData>(
                [
                    new PurchaseOrderData(
                        "PO-100",
                        "PO-100",
                        "V1",
                        10m,
                        "USD",
                        OperationalTimestamp.FromSource(DateTimeOffset.UtcNow),
                        Quality.Good())
                ],
                Array.Empty<string>()));

        var endpoints = Substitute.For<IIntegrationEndpointRepository>();
        endpoints.GetByIdForTenantAsync(endpoint.Id, "tenant-a", Arg.Any<CancellationToken>()).Returns(endpoint);

        var exchanges = Substitute.For<IExchangeRecordRepository>();
        exchanges.ExistsByIdempotencyKeyAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(false);

        var publisher = Substitute.For<IEventPublisher>();
        var audit = Substitute.For<IAuditWriter>();
        var uow = Substitute.For<IUnitOfWork>();

        var handler = new SyncErpPurchaseOrderHandler(
            erp,
            endpoints,
            exchanges,
            publisher,
            audit,
            uow,
            User(),
            NullLogger<SyncErpPurchaseOrderHandler>.Instance);

        var result = await handler.Handle(new SyncErpPurchaseOrderCommand(endpoint.Id), CancellationToken.None);

        result.Accepted.Should().HaveCount(1);
        result.RejectedReasons.Should().BeEmpty();
        result.Accepted[0].TimestampOrigin.Should().Be(nameof(TimestampOrigin.Source));
        await exchanges.Received(1).AddAsync(Arg.Any<ExchangeRecord>(), Arg.Any<CancellationToken>());
        await publisher.Received(1).PublishAsync(
            Arg.Any<Platform.I2P.Contracts.Events.ErpDataReceivedEvent>(),
            Arg.Any<CancellationToken>());
        await uow.Received().SaveChangesAsync(Arg.Any<CancellationToken>());
        await audit.Received(1).WriteAsync("ManualSyncCompleted", "user-1", Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_Rejects_Cross_Tenant_Endpoint()
    {
        var endpoints = Substitute.For<IIntegrationEndpointRepository>();
        endpoints.GetByIdForTenantAsync(Arg.Any<Guid>(), "tenant-a", Arg.Any<CancellationToken>())
            .Returns((IntegrationEndpoint?)null);

        var handler = new SyncErpPurchaseOrderHandler(
            Substitute.For<IErpConnector>(),
            endpoints,
            Substitute.For<IExchangeRecordRepository>(),
            Substitute.For<IEventPublisher>(),
            Substitute.For<IAuditWriter>(),
            Substitute.For<IUnitOfWork>(),
            User(),
            NullLogger<SyncErpPurchaseOrderHandler>.Instance);

        var act = () => handler.Handle(new SyncErpPurchaseOrderCommand(Guid.NewGuid()), CancellationToken.None);
        await act.Should().ThrowAsync<Platform.I2P.Domain.Exceptions.ForbiddenResourceException>();
    }

    [Fact]
    public async Task Handle_Skips_Duplicates()
    {
        var endpoint = IntegrationEndpoint.Create("tenant-a", "SAP-Main", ConnectorType.Erp, "https://sap.example/");
        var erp = Substitute.For<IErpConnector>();
        erp.ConnectorName.Returns("SAP");
        erp.GetPurchaseOrdersAsync(endpoint.Id, null, Arg.Any<CancellationToken>())
            .Returns(new ConnectorBatchResult<PurchaseOrderData>(
                [
                    new PurchaseOrderData(
                        "PO-100",
                        "PO-100",
                        "V1",
                        10m,
                        "USD",
                        OperationalTimestamp.FromPlatform(),
                        Quality.Good())
                ],
                Array.Empty<string>()));

        var endpoints = Substitute.For<IIntegrationEndpointRepository>();
        endpoints.GetByIdForTenantAsync(endpoint.Id, "tenant-a", Arg.Any<CancellationToken>()).Returns(endpoint);

        var exchanges = Substitute.For<IExchangeRecordRepository>();
        exchanges.ExistsByIdempotencyKeyAsync(Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(true);

        var uow = Substitute.For<IUnitOfWork>();
        var handler = new SyncErpPurchaseOrderHandler(
            erp,
            endpoints,
            exchanges,
            Substitute.For<IEventPublisher>(),
            Substitute.For<IAuditWriter>(),
            uow,
            User(),
            NullLogger<SyncErpPurchaseOrderHandler>.Instance);

        var result = await handler.Handle(new SyncErpPurchaseOrderCommand(endpoint.Id), CancellationToken.None);

        result.Accepted.Should().BeEmpty();
        await exchanges.DidNotReceive().AddAsync(Arg.Any<ExchangeRecord>(), Arg.Any<CancellationToken>());
        await uow.Received().SaveChangesAsync(Arg.Any<CancellationToken>());
    }
}
