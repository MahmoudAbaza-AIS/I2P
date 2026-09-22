using FluentValidation;
using MediatR;
using Platform.I2P.Application.Ports;
using Platform.I2P.Application.Security;
using Platform.I2P.Contracts.Dtos;

namespace Platform.I2P.Application.Queries.GetExchangeHistory;

public sealed record GetExchangeHistoryQuery(int Page = 1, int PageSize = 50)
    : IRequest<PagedResultDto<ExchangeHistoryItemDto>>;

public sealed class GetExchangeHistoryValidator : AbstractValidator<GetExchangeHistoryQuery>
{
    public GetExchangeHistoryValidator()
    {
        RuleFor(x => x.Page).GreaterThan(0);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 500);
    }
}

public sealed class GetExchangeHistoryHandler
    : IRequestHandler<GetExchangeHistoryQuery, PagedResultDto<ExchangeHistoryItemDto>>
{
    private readonly IExchangeRecordRepository _exchanges;
    private readonly ICurrentUserContext _user;

    public GetExchangeHistoryHandler(IExchangeRecordRepository exchanges, ICurrentUserContext user)
    {
        _exchanges = exchanges;
        _user = user;
    }

    public async Task<PagedResultDto<ExchangeHistoryItemDto>> Handle(
        GetExchangeHistoryQuery request,
        CancellationToken cancellationToken)
    {
        var items = await _exchanges.GetPagedForTenantAsync(
            _user.TenantId,
            request.Page,
            request.PageSize,
            cancellationToken);
        var total = await _exchanges.CountForTenantAsync(_user.TenantId, cancellationToken);

        var dtos = items.Select(x => new ExchangeHistoryItemDto(
            x.Id,
            x.EndpointId,
            x.ExternalId,
            x.SourceSystem,
            x.Quality.Code.ToString(),
            x.Timestamp.Value,
            x.ReceivedAtUtc)).ToList();

        return new PagedResultDto<ExchangeHistoryItemDto>(dtos, request.Page, request.PageSize, total);
    }
}
