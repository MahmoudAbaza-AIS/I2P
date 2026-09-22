using MediatR;
using Platform.I2P.Application.Ports;
using Platform.I2P.Contracts.Dtos;

namespace Platform.I2P.Application.Queries.GetIntegrationHealth;

public sealed record GetIntegrationHealthQuery : IRequest<IReadOnlyList<IntegrationHealthDto>>;

public sealed class GetIntegrationHealthHandler
    : IRequestHandler<GetIntegrationHealthQuery, IReadOnlyList<IntegrationHealthDto>>
{
    private readonly IErpConnector _erp;
    private readonly IMesConnector _mes;
    private readonly ICmmsConnector _cmms;
    private readonly IGisConnector _gis;
    private readonly ILimsConnector _lims;

    public GetIntegrationHealthHandler(
        IErpConnector erp,
        IMesConnector mes,
        ICmmsConnector cmms,
        IGisConnector gis,
        ILimsConnector lims)
    {
        _erp = erp;
        _mes = mes;
        _cmms = cmms;
        _gis = gis;
        _lims = lims;
    }

    public async Task<IReadOnlyList<IntegrationHealthDto>> Handle(
        GetIntegrationHealthQuery request,
        CancellationToken cancellationToken)
    {
        var checkedAt = DateTimeOffset.UtcNow;
        var connectors = new (string Name, Func<CancellationToken, Task<ConnectorHealth>> Probe)[]
        {
            (_erp.ConnectorName, _erp.GetHealthAsync),
            (_mes.ConnectorName, _mes.GetHealthAsync),
            (_cmms.ConnectorName, _cmms.GetHealthAsync),
            (_gis.ConnectorName, _gis.GetHealthAsync),
            (_lims.ConnectorName, _lims.GetHealthAsync)
        };

        var results = new List<IntegrationHealthDto>();
        foreach (var (name, probe) in connectors)
        {
            try
            {
                var health = await probe(cancellationToken);
                results.Add(new IntegrationHealthDto(name, health.IsHealthy, health.Status, checkedAt, health.Detail));
            }
            catch (Exception ex)
            {
                results.Add(new IntegrationHealthDto(name, false, "Error", checkedAt, ex.Message));
            }
        }

        return results;
    }
}
