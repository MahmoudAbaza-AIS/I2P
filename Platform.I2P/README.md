# Platform.I2P — Integration-to-Platform Service

Workstream G (External System Integration) of the **Industrial SCADA Automation Platform**.

| | |
|---|---|
| **Name** | Integration-to-Platform (I2P) |
| **Runtime** | .NET 10 |
| **Shape** | Separately deployable service; Clean Architecture / Hexagonal internally |
| **Database** | SQL Server only (config, mappings, exchanges, audit, outbox) |
| **Messaging** | Transactional outbox → MassTransit → RabbitMQ |

Standards: `Platform.Docs/Implementation and Release/RELEASE_GATES.md` and the PR checklist PDF in the same folder. Root overview: [`../README.md`](../README.md).

## Business rules (short)

- **Supervisory only** — no control-layer writes (PLC/DCS/RTU/SIS/OPC UA write).
- **Configuration over customization** — new entities/customers via config, not forks.
- **No data fabrication** — reject incomplete required source fields; never invent quality/currency/IDs.
- **Vendor types stay in connectors** — other modules consume `Platform.I2P.Contracts` only.
- **UTC everywhere** for persisted/exchanged timestamps.

## Solution layout

```
src/
  Platform.I2P.Domain/           # Pure BCL business rules
  Platform.I2P.Application/      # MediatR + FluentValidation + ports
  Platform.I2P.Infrastructure/   # EF Core, outbox, MassTransit, secrets, Polly helpers
  Platform.I2P.Connectors.Sap/   # ERP (SAP) HTTP/OData-style — primary sync path
  Platform.I2P.Connectors.Mes/   # REST health (+ future sync); no OPC UA in-tree
  Platform.I2P.Connectors.Cmms/
  Platform.I2P.Connectors.Gis/
  Platform.I2P.Connectors.Lims/
  Platform.I2P.Contracts/        # Versioned DTOs/events for other modules
  Platform.I2P.Api/              # Composition root + HTTP + health + Scalar
tests/
  *.Architecture.Tests           # NetArchTest boundary enforcement
  *.Domain|Application|Api|Connectors|Integration.Tests
```

## Current defaults

| Decision | Choice |
|---|---|
| Core platform contracts | Provisional local models in Domain (`Quality`, `OperationalTimestamp`) until Stage-1 packages land |
| Vendor systems | WireMock contract tests; **sandbox confirmation is a release gate** |
| Auth | Dev bearer (Development, fail-closed); set `Auth:Authority` for Entra ID / Duende JWT elsewhere |
| Sync HTTP today | ERP purchase orders only; MES/CMMS/GIS/LIMS are health-oriented |
| Deploy | Container image (`Dockerfile`); `/health/live` + `/health/ready` before traffic cutover |

## Run

```bash
dotnet restore Platform.I2P.sln
dotnet build Platform.I2P.sln
dotnet test Platform.I2P.sln --filter "FullyQualifiedName!~Integration.Tests"
dotnet run --project src/Platform.I2P.Api --launch-profile http
```

| URL | Purpose |
|---|---|
| `http://localhost:5044/scalar/v1` | Scalar UI (Mars theme) |
| `http://localhost:5044/openapi/v1.json` | OpenAPI |
| `http://localhost:5044/health/live` | Liveness (anonymous) |
| `http://localhost:5044/health/ready` | Readiness (SQL / messaging) |

HTTPS profile also serves `https://localhost:7174`.

Set `ConnectionStrings__I2P` via environment / user-secrets. Do not commit real credentials.

Integration tests require Docker (Testcontainers SQL Server + RabbitMQ) and **fail the suite** if Docker is unavailable.

## Requirement traceability (selected)

- FR-API / Workstream G — external integration module
- FR-RTAG-051–054 — timestamp + quality propagation
- FR-SEC-031–040 / 061–062 — secrets provider + authenticated endpoints
- FR-COM-046 / FR-RTD-020 — idempotency on exchange
- FR-API-048 / FR-API-050 — outbox / guaranteed delivery
- NFR-MNT-051–058 — layered automated tests + architecture gates
- PSRS-001 §2.9.3 / §2.9.5 — supervisory boundary + configuration without source modification
