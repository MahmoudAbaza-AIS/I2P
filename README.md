# Platform.I2P

**Integration-to-Platform (I2P)** is the external-system integration service of the **Industrial SCADA Automation Platform**. It connects the platform to ERP (SAP), MES, CMMS, GIS, and LIMS through isolated, swappable connectors — without letting a vendor SDK, schema, or protocol leak into the rest of the platform.

| | |
|---|---|
| **Abbreviation** | I2P |
| **Expansion** | Integration-to-Platform |
| **Platform** | Industrial SCADA Automation Platform |
| **Workstream** | IMP-PLAN-001 Workstream G (Integration) |
| **Deployment** | Separately deployable service (own solution, container image, CI/CD) |
| **Internal design** | Clean Architecture / Hexagonal (ports & adapters) |

Governing baselines (under `Platform.Docs/Requirements and Traceability/`): `PSRS-001`, `IMP-PLAN-001`, `RTM-001`. PR standards: `Platform.Docs/Implementation and Release/` (PDF checklist + `RELEASE_GATES.md`).

---

## Business rules (non-negotiable)

These come from PSRS-001 §2.5 / §2.9 and the Workstream G allocation. Docs and code must stay honest to them.

1. **Supervisory only.** I2P never sends commands, setpoints, or writes to control-layer endpoints (PLC, DCS, RTU, SIS, OPC UA write/call, Modbus registers, etc.). Enterprise systems may only produce **request events** for the platform Supervisory Control module — I2P does not transmit control itself.
2. **Configuration over customization.** New customers and external entities are delivered by configuration, not source changes (PSRS-001 §2.5, §2.9.5 #4).
3. **Vendor isolation.** Vendor SDKs, DTOs, and protocols live only inside `Platform.I2P.Connectors.`*. Domain, Application, and Contracts stay vendor-free.
4. **Data integrity — no fabrication.** Missing required source fields are rejected (or quality is marked Unknown). Never invent `Quality.Good()`, currencies, IDs, or geometry.
5. **Timestamps are UTC.** Persisted and exchanged times use UTC; display time zones are not I2P’s concern.
6. **Operational values follow platform ingestion.** I2P must not publish operational tag values directly to Historian or Alarm Management (those depend on Data Acquisition / Tag Management / RTDB validation). Business exchange events go through the transactional outbox → message bus.
7. **Secrets never in source.** Credentials and connection strings resolve through `ISecretsProvider` / environment injection — never committed.
8. **Other modules depend only on** `Platform.I2P.Contracts`**.** Never on Domain, Application, or Infrastructure.

---

## What I2P does

I2P is the secured translator between external enterprise/ops systems and the platform:

1. Authenticate and authorize the caller (JWT; Development uses a fail-closed Dev bearer).
2. Call the correct external system through a connector.
3. Normalize vendor payloads into internal exchange records (quality + operational timestamps preserved).
4. Persist configuration, mappings, exchanges, audit, and outbox rows in **SQL Server**.
5. Publish allowlisted integration events via **transactional outbox → MassTransit → RabbitMQ**.
6. Expose versioned HTTP APIs for sync, exchange history, mappings, health, and outbox dead-letter handling.

It does **not** replace ERP/MES/CMMS/GIS/LIMS products, and it does **not** perform deterministic process control.

---

## Current capability (honest)

| Area | Status |
|---|---|
| ERP (SAP) purchase-order sync | Implemented (HTTP/OData-style); WireMock-tested; live vendor sandbox still a release gate |
| MES / CMMS / GIS / LIMS | **Health probes only** — no production sync HTTP paths yet |
| Field mappings API | Update endpoint exists; mappings are not yet applied on the sync path |
| Outbox → RabbitMQ | Implemented; required outside Development |
| Tenants / executive dashboard HTTP APIs | **Not in current source controllers** (historical docs may still mention them) |
| OPC UA / B2MML / industrial protocol clients | **Not present** — MES connector is REST/HTTP only |
| CI `deploy-*` jobs | Echo stubs — not real rollout automation |
| Live SAP/MES/… interoperability | Unverified until authorized sandbox validation |

---

## System context

```
                         EXTERNAL SYSTEMS (read/exchange only)
   ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
   │ ERP (SAP) │  │    MES    │  │   CMMS    │  │    GIS    │  │   LIMS    │
   │ HTTP/OData│  │ HTTP/REST │  │ HTTP/REST │  │ HTTP/REST │  │ HTTP/REST │
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         │              │              │              │              │
   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
   │ SapConn.  │  │ MesConn.  │  │ CmmsConn. │  │ GisConn.  │  │ LimsConn. │
   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
         └──────────────┴──────────────┴──────────────┴──────────────┘
                                   │ ports (IErpConnector, …)
                     ┌─────────────▼──────────────┐
                     │  Platform.I2P.Application   │
                     │  MediatR, validation, ports │
                     └─────────────┬──────────────┘
                                   │
                     ┌─────────────▼──────────────┐
                     │   Platform.I2P.Domain       │
                     │   BCL-only business rules  │
                     └─────────────┬──────────────┘
              ┌────────────────────┼────────────────────┐
     ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐
     │   SQL Server     │  │  Outbox table   │  │ Secrets provider│
     │ config, mappings │  │  (guaranteed    │  │ (no secrets in  │
     │ exchanges, audit │  │   delivery)     │  │  source / DB)   │
     └──────────────────┘  └────────┬────────┘  └─────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │ MassTransit +      │
                          │ RabbitMQ           │
                          └─────────┬─────────┘
                                    │
                    platform consumers (via Contracts events)
                    — not a direct bypass into Historian/Alarms

                     ┌──────────────────────────────┐
                     │     Platform.I2P.Api          │
                     │ ASP.NET Core, OpenAPI/Scalar │
                     │ auth, versioning, health     │
                     └──────────────────────────────┘
```

External systems never touch the I2P database directly. Each is reached through its connector and normalized before anything downstream sees it.

---

## Architecture rules

```
Platform.I2P.Domain
  references NOTHING but the .NET BCL
  enforced by Platform.I2P.Architecture.Tests (NetArchTest)

Other platform modules
  depend ONLY on Platform.I2P.Contracts
  never on Domain, Application, Infrastructure, or Connectors
```

| Rule | Why |
|---|---|
| Separately deployable service | Own solution, Dockerfile, and pipeline; talks to peers over Contracts + RabbitMQ (NFR-CON-001 / NFR-CON-009) |
| Clean Architecture inside the service | Business rules testable without DB/HTTP; connectors stay swappable |
| Configuration over customization | Project-specific behavior belongs in config, not forks of source |
| Connectors are the only vendor boundary | Isolates SAP/MES/CMMS/GIS/LIMS instability |

---

## Repository layout

```
I2P/
├── README.md                          # this file
├── Platform.Docs/                     # requirements, guides, remediation, security
├── Platform.I2P/                      # .NET solution (API service)
│   ├── Dockerfile
│   ├── Platform.I2P.sln
│   ├── src/
│   │   ├── Platform.I2P.Domain/
│   │   ├── Platform.I2P.Application/
│   │   ├── Platform.I2P.Infrastructure/
│   │   ├── Platform.I2P.Connectors.Sap/
│   │   ├── Platform.I2P.Connectors.Mes/
│   │   ├── Platform.I2P.Connectors.Cmms/
│   │   ├── Platform.I2P.Connectors.Gis/
│   │   ├── Platform.I2P.Connectors.Lims/
│   │   ├── Platform.I2P.Contracts/
│   │   └── Platform.I2P.Api/
│   └── tests/
│       ├── *.Domain|Application|Api|Architecture.Tests
│       ├── *.Connectors.*.Tests       # WireMock only — never live vendor calls in CI
│       └── *.Integration.Tests        # Testcontainers: SQL Server + RabbitMQ
├── Platform.UI/                       # Angular SPA (shell + I2P vertical slice)
└── .github/workflows/i2p-ci.yml
```

Empty connector folders under `src/` (if present) are not active implementations — only projects registered in `Program.cs` and containing source are live.

---

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | .NET 10 |
| API | ASP.NET Core Web API + OpenAPI + Scalar (Mars theme) |
| Application | MediatR + FluentValidation |
| Persistence | SQL Server + EF Core |
| Messaging | MassTransit + RabbitMQ + transactional outbox |
| Resilience | Polly on outbound connector calls |
| Auth | JWT bearer; `Auth:Authority` required outside Development; Dev bearer is Development-only and fail-closed |
| Observability | Serilog + OpenTelemetry |
| Testing | xUnit, FluentAssertions, WireMock.Net, Testcontainers, NetArchTest |

---

## Local API surface (v1)

Default launch profile: `http://localhost:5044` (HTTPS profile also binds `https://localhost:7174`).

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/scalar` (or launch `scalar/v1`) | Anonymous | Interactive docs |
| GET | `/openapi/v1.json` | Anonymous | OpenAPI document |
| GET | `/health/live` | Anonymous | Process up |
| GET | `/health/ready` | Anonymous | SQL (+ messaging) readiness |
| GET | `/api/v1/integration/health` | Reader | Live connector health fan-out |
| POST | `/api/v1/integration/sync/erp/purchase-orders` | Operator | SAP PO sync |
| GET | `/api/v1/integration/sync/exchanges` | Reader | Exchange history |
| PUT | `/api/v1/integration/mappings/{mappingId}` | Admin | Update field mapping |
| GET/POST | `/api/v1/integration/outbox/dead-letters`… | Admin | Dead-letter list / requeue |

Unversioned `/api/integration/...` may still map to v1 where configured; prefer `/api/v1/...`.

---

## Environments & promotion

```
feature branch ──PR──▶  dev  ──PR──▶  ppr  ──PR──▶  main
```

| Environment | Branch | Notes |
|---|---|---|
| Development | `dev` | Fast iteration |
| Preproduction | `ppr` | FAT/SAT/UAT and vendor-sandbox validation |
| Production | `main` | Manual approval; on-prem OT zone by default |

Promote only feature → `dev` → `ppr` → `main` in the same repository. Do not push directly to `ppr` or `main`. Push-triggered CI after merge is intentional; it does not authorize direct pushes.

Runtime control-critical pieces stay on-premises inside the customer’s OT-segmented network by default (IEC 62443 / NIST SP 800-82 posture). Cloud is limited to non-control-critical slices (monitoring, licensing, remote diagnostics).

---

## CI/CD

`.github/workflows/i2p-ci.yml` runs on PRs into `dev` / `ppr` / `main` (plus scheduled dependency scan): metadata/requirement ID check, promotion-path check, secret scan, build + Sonar gate, platform/connector/integration tests, dependency scan, sensitive-review confirmation.

`all-checks` fails closed. Fork PRs cannot use repository secrets and stay blocked from protected promotion — do not use `pull_request_target` to work around that.

**Deploy jobs are stubs today** (D-11). The environment table above describes the intended flow, not completed automation.

Branch ruleset example: `.github/config/main-ppr-ruleset.json` (importable; not active until an administrator applies it).

---

## Testing

| Layer | How | Rule |
|---|---|---|
| Domain | Unit, zero mocks | Pure logic |
| Application | Unit, mocked ports | No real infrastructure |
| Connectors | WireMock contract tests | Never call live vendors in CI; sandbox confirmation is a release gate |
| Integration | Testcontainers SQL + RabbitMQ | Fail (do not skip) if Docker is unavailable |
| Architecture | NetArchTest | Domain BCL-only; Contracts-only cross-module dependency |

---

## Security highlights

Full checklist: `Platform.Docs/Security/Cursor_Security_Audit_Prompt.md`.

- No secrets in source; `ISecretsProvider` only.
- Resource-scoped authorization (not auth alone) for tenant/endpoint ownership.
- Parameterized data access only.
- NuGet packages verified against the official registry before merge.
- No local password hashing — identity is delegated to the IdP.

---

## Getting started

```bash
git clone <repo>
cd Platform.I2P
dotnet restore Platform.I2P.sln
dotnet build Platform.I2P.sln -c Release
dotnet test Platform.I2P.sln --filter "FullyQualifiedName!~Integration.Tests"
dotnet run --project src/Platform.I2P.Api --launch-profile http
```

Then open `http://localhost:5044/scalar/v1` and `http://localhost:5044/openapi/v1.json`.

Set `ConnectionStrings__I2P` via environment or user-secrets. Do not commit credentials. See `Platform.Docs/Configuration/appsettings.example.md`.

Docker is required for `Platform.I2P.Integration.Tests`.

UI (optional): see `Platform.UI/README.md` (`npm ci` / `npm start`; proxies to `http://localhost:5044`).

---

## Contributing

Every PR must:

1. Reference a requirement ID (`FR-…` / `NFR-…`) from the approved baseline / remediation Appendix A — never invent IDs.
2. Pass every required job in `i2p-ci.yml`.
3. For auth/security/secrets/identity/encryption changes: non-author approval whose review body includes `Negative-path coverage: CONFIRMED`.

Remediation work follows `Platform.Docs/Implementation and Release/Cursor_I2P_Remediation_Prompt.md` (one WP per branch/PR to `dev`; stop at every STOP gate).

---

## Governing documents

| Document | Location / purpose |
|---|---|
| PSRS-001 | `Platform.Docs/Requirements and Traceability/` — platform requirements baseline |
| IMP-PLAN-001 | Same — workstream dependency plan |
| RTM-001 | Same — requirements traceability matrix |
| PR standards checklist | `Platform.Docs/Implementation and Release/` (PDF) + `RELEASE_GATES.md` |
| Security audit prompt | `Platform.Docs/Security/Cursor_Security_Audit_Prompt.md` |
| Remediation prompt | `Platform.Docs/Implementation and Release/Cursor_I2P_Remediation_Prompt.md` |
| Junior onboarding | `Platform.Docs/Business Overview/JUNIOR_ENGINEER_START_TO_FINISH.md` |
| Quick API card | `Platform.Docs/Business Overview/QUICK_REFERENCE.md` |
