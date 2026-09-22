using FluentAssertions;
using FluentValidation;
using MediatR;
using NSubstitute;
using Platform.I2P.Application.Behaviors;
using Platform.I2P.Application.Commands.SyncErpPurchaseOrder;
using Platform.I2P.Domain.Exceptions;

namespace Platform.I2P.Application.Tests;

public class ValidationBehaviorTests
{
    [Fact]
    public async Task ValidationBehavior_Rejects_Empty_EndpointId_Before_Handler()
    {
        var behavior = new ValidationBehavior<SyncErpPurchaseOrderCommand, IReadOnlyList<object>>(
            [new SyncErpPurchaseOrderValidator()]);

        var next = Substitute.For<RequestHandlerDelegate<IReadOnlyList<object>>>();
        next.Invoke().Returns(Array.Empty<object>());

        var act = () => behavior.Handle(
            new SyncErpPurchaseOrderCommand(Guid.Empty),
            next,
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>();
        await next.DidNotReceive().Invoke();
    }

    [Fact]
    public async Task ValidationBehavior_Invokes_Handler_When_Valid()
    {
        var behavior = new ValidationBehavior<SyncErpPurchaseOrderCommand, string>(
            [new SyncErpPurchaseOrderValidator()]);

        var next = Substitute.For<RequestHandlerDelegate<string>>();
        next.Invoke().Returns("ok");

        var result = await behavior.Handle(
            new SyncErpPurchaseOrderCommand(Guid.NewGuid()),
            next,
            CancellationToken.None);

        result.Should().Be("ok");
        await next.Received(1).Invoke();
    }
}

public class UpdateFieldMappingSecurityTests
{
    [Fact]
    public async Task Handle_Rejects_Cross_Tenant_Mapping_Id()
    {
        var mappings = Substitute.For<Platform.I2P.Application.Ports.IFieldMappingRepository>();
        mappings.GetByIdForTenantAsync(Arg.Any<Guid>(), "tenant-a", Arg.Any<CancellationToken>())
            .Returns((Platform.I2P.Domain.Entities.FieldMapping?)null);

        var user = Substitute.For<Platform.I2P.Application.Security.ICurrentUserContext>();
        user.TenantId.Returns("tenant-a");
        user.Subject.Returns("user-1");

        var handler = new Platform.I2P.Application.Commands.UpdateFieldMapping.UpdateFieldMappingHandler(
            mappings,
            Substitute.For<Platform.I2P.Application.Ports.IAuditWriter>(),
            user);

        var act = () => handler.Handle(
            new Platform.I2P.Application.Commands.UpdateFieldMapping.UpdateFieldMappingCommand(
                Guid.NewGuid(), "a", "b", true),
            CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenResourceException>();
    }
}
