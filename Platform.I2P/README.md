# Platform.I2P — Integration-to-Platform Module

Workstream G (External System Integration) of the Industrial SCADA Automation Platform.

**Runtime:** .NET 10 · **Pattern:** Modular monolith / Clean Architecture · **Database:** SQL Server only

Standards baseline: `Platform.Docs/PR_Code_Standards_Checklist_v3_Complete.pdf` (see also [docs/RELEASE_GATES.md](docs/RELEASE_GATES.md)).

## Solution layout

```
src/
  Platform.I2P.Domain/           # Pure BCL business rules
  Platform.I2P.Application/      # MediatR commands/queries + FluentValidation pipeline
  Platform.I2P.Infrastructure/   # EF Core, outbox, MassTransit, secrets, Polly
  Platform.I2P.Connectors.*/     # SAP / MES / CMMS / GIS / LIMS (vendor types stay here)
  Platform.I2P.Contracts/        # Versioned DTOs/events for other modules (NuGet)
  Platform.I2P.Api/              # Composition root + HTTP + health probes
tests/
  *.Architecture.Tests           # NetArchTest boundary enforcement
  *.Domain|Application|Api|Connectors|Integration.Tests
```

## Defaults used for this scaffold

| Decision | Choice |
|---|---|
| Core platform contracts | Minimal local models in Domain (`Quality`, `OperationalTimestamp`) |
| Solution | New standalone `Platform.I2P` |
| Vendor systems | Mocked HTTP contracts (WireMock) — sandbox confirmation is a **release gate** |
| Auth | Dev bearer (Development, fail-closed); set `Auth:Authority` for Entra ID / Duende JWT in non-dev |
| Connectors | REST/OData-style mocks configurable via `Connectors:*` |
| Deploy | Container image (`Dockerfile`); `/health/live` + `/health/ready` before traffic cutover |

## Run

```bash
dotnet restore Platform.I2P.sln
dotnet build Platform.I2P.sln
dotnet test Platform.I2P.sln --filter "FullyQualifiedName!~Integration.Tests"
dotnet run --project src/Platform.I2P.Api
```

OpenAPI document (Development): `/openapi/v1.json`  
Health: `/health/live` (anonymous), `/health/ready` (SQL readiness)

Set `ConnectionStrings__I2P` via environment / user-secrets. Do not commit real credentials.

Integration tests require Docker (Testcontainers SQL Server + RabbitMQ) and **fail the suite** if Docker is unavailable.

## Requirement traceability (selected)

- FR-API / Workstream G — external integration module
- FR-RTAG-051–054 — timestamp + quality propagation
- FR-SEC-031–040 / 061–062 — secrets provider + authenticated endpoints
- FR-COM-046 / FR-RTD-020 — idempotency on exchange
- NFR-MNT-051–058 — layered automated tests + architecture gates
- PR-STD-v3 — architecture, security, dependency, deploy, and connector gates
