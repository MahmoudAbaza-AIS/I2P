# Platform.I2P

**Integration-to-Platform (I2P)** is the external system integration module of the Industrial SCADA Automation Platform. It connects the platform to ERP, MES, CMMS, GIS, and LIMS systems through a set of isolated, swappable connectors, without ever letting a vendor's SDK, schema, or protocol leak into the rest of the platform.

Governing requirements: `PSRS-001` (platform requirements baseline), `IMP-PLAN-001` (implementation and workstream dependency plan), `RTM-001` (requirements traceability matrix). All three live in `Platform.Docs/`.

---

## What This Is, in One Paragraph

I2P belongs to Workstream G (Integration) of the platform's build plan, a Stage-3 feature workstream that only starts once the Core Platform Baseline (shared identity, timestamp, and quality models from the Data Foundation, Platform Core, and Security Core workstreams) is stable. It is built as a **Modular Monolith**: one deployable process, internally structured as **Clean Architecture / Hexagonal / Ports-and-Adapters** per module, so business logic stays testable and swappable without paying the operational cost of microservices this platform doesn't yet need.

---

## System Diagram

```
                                EXTERNAL SYSTEMS
   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │    ERP    │   │    MES    │   │   CMMS    │   │    GIS    │   │   LIMS/BI │
   │  (SAP)    │   │           │   │           │   │           │   │           │
   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
         │ OData/BAPI/    │ OPC-UA/        │ REST/         │ REST/WFS/     │ HL7/REST
         │ IDoc           │ REST+B2MML     │ ODBC          │ WMS           │
   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
   │  SapConn  │   │  MesConn  │   │ CmmsConn  │   │  GisConn  │   │ LimsConn  │
   │  ector    │   │  ector    │   │  ector    │   │  ector    │   │  ector    │
   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘   └─────┬─────┘
         └────────────────┴────────────────┴───────────────┴───────────────┘
                    Each connector implements a shared port interface
                    (IErpConnector, IMesConnector...) and normalizes
                            data into ONE internal shape
                                          │
                        ┌─────────────────▼──────────────────┐
                        │      Platform.I2P.Application       │
                        │   MediatR handlers, validators,     │
                        │   orchestration, port interfaces    │
                        └─────────────────┬────────────────────┘
                                          │
                        ┌─────────────────▼──────────────────┐
                        │       Platform.I2P.Domain            │
                        │  pure C#, zero NuGet packages,       │
                        │  entities, mapping rules,             │
                        │  idempotency logic                    │
                        └─────────────────┬────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
     ┌────────▼────────┐        ┌─────────▼─────────┐        ┌────────▼────────┐
     │  SQL Server      │        │  Outbox Table      │        │  Secrets Manager │
     │  config, mappings│        │  guaranteed          │        │  credentials,    │
     │  audit            │        │  delivery            │        │  never in DB     │
     └───────────────────┘        └─────────┬───────────┘        └──────────────────┘
                                             │
                                   ┌─────────▼─────────┐
                                   │  MassTransit +      │
                                   │  RabbitMQ           │
                                   └─────────┬───────────┘
              ┌──────────────────────────────┼──────────────────────────────┐
     ┌────────▼────────┐          ┌──────────▼──────────┐         ┌────────▼────────┐
     │  Alarm Management │          │  Historian            │         │  Notification    │
     └────────────────────┘          └───────────────────────┘         └──────────────────┘

                        ┌──────────────────────────────────┐
                        │       Platform.I2P.Api             │
                        │  ASP.NET Core controllers,         │
                        │  OpenAPI, auth middleware          │
                        │  <- dashboards, mobile, partners    │
                        └──────────────────────────────────┘
```

External systems never touch the database directly. Each is reached through its native protocol, absorbed by a dedicated connector, and normalized before anything downstream ever sees it. Time-series data goes to the Historian, everything else (config, mappings, audit, the outbox) lives in SQL Server.

---

## Architecture Rules (Non-Negotiable)

```
┌─────────────────────────────────────────────────────────────┐
│  Platform.I2P.Domain                                         │
│  references NOTHING but the .NET BCL                        │
│  no EF Core · no ASP.NET · no vendor SDK · no MassTransit     │
│  enforced by Platform.I2P.Architecture.Tests (NetArchTest)    │
└─────────────────────────────────────────────────────────────┘
                              ▲
                    only Application depends on Domain
                              ▲
┌─────────────────────────────────────────────────────────────┐
│  Other platform modules (Alarm Management, Historian, ...)   │
│  depend ONLY on Platform.I2P.Contracts                        │
│  never on Domain, Application, or Infrastructure directly     │
└─────────────────────────────────────────────────────────────┘
```

| Rule | Why |
|---|---|
| Modular Monolith, not microservices | No documented scale evidence requires independent deployment yet; microservices trade a real problem for network partitions, distributed tracing, and N pipelines you'd be paying for without a benefit to cash in |
| Each module is internally Clean Architecture | Business rules testable without a database, swappable without touching core logic |
| Configuration over customization | Platform-wide design principle; project-specific behavior belongs in config, not source changes |
| Connectors are the only place a vendor SDK may live | Isolates SAP/MES/CMMS/GIS/LIMS instability; a bug in one connector's date parsing can't corrupt another's data |

---

## Solution Structure

```
Platform.I2P/
├── Dockerfile
├── Platform.I2P.sln
├── src/
│   ├── Platform.I2P.Domain/              # pure business logic, zero dependencies
│   ├── Platform.I2P.Application/         # MediatR commands/queries, port interfaces
│   ├── Platform.I2P.Infrastructure/       # EF Core, outbox, MassTransit, secrets, Polly
│   ├── Platform.I2P.Connectors.Sap/       # OData/BAPI/IDoc, confirmed against sandbox
│   ├── Platform.I2P.Connectors.Mes/       # OPC-UA / REST+B2MML
│   ├── Platform.I2P.Connectors.Cmms/
│   ├── Platform.I2P.Connectors.Gis/
│   ├── Platform.I2P.Connectors.Lims/
│   ├── Platform.I2P.Contracts/            # the ONLY thing other modules may depend on
│   └── Platform.I2P.Api/                  # controllers, OpenAPI, auth middleware
└── tests/
    ├── Platform.I2P.Domain.Tests/         # pure unit tests, no mocks
    ├── Platform.I2P.Application.Tests/    # handler tests, mocked ports
    ├── Platform.I2P.Api.Tests/
    ├── Platform.I2P.Architecture.Tests/   # fails the build on boundary violations
    ├── Platform.I2P.Connectors.*.Tests/   # WireMock only, never a live vendor call
    └── Platform.I2P.Integration.Tests/    # Testcontainers: real SQL Server + RabbitMQ
```

---

## Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Runtime | .NET 10 (LTS) | .NET 8 reaches end of support Nov 2026; .NET 10 is supported through Nov 2028 |
| API | ASP.NET Core Web API + OpenAPI | Contract-first friendly, generates the spec reviewed in every PR |
| Application layer | MediatR + FluentValidation | Thin controllers, validation out of controllers and domain entities |
| ORM | EF Core (config/CRUD) + Dapper (hot-path reads) | Productivity where perf doesn't matter, raw speed where it does |
| Messaging | MassTransit + RabbitMQ | Outbox pattern, retries, dead-lettering, satisfies the platform's guaranteed-delivery requirement (FR-API-048) |
| Resilience | Polly | Circuit breaker + retry-with-backoff on every outbound connector call |
| Auth | Duende IdentityServer or Entra ID (decision pending) | OAuth2 client-credentials for machine-to-machine, delegated tokens for humans |
| Observability | Serilog + OpenTelemetry | Structured logs, correlation IDs, traces |
| Testing | xUnit, FluentAssertions, WireMock.Net, Testcontainers | No live vendor calls, no in-memory-fake database behavior gaps |
| Database | SQL Server only | Already operated in production; time-series data goes to the platform Historian, not here |

---

## Environments

```
   feature branch ──PR──▶  dev  ──PR──▶  ppr (Preproduction) ──PR──▶  main
                            │                  │                  │
                      auto-deploy        rolling deploy      rolling deploy
                      no redundancy      through redundancy  through redundancy
                      fast iteration     pair (dress         pair, MANUAL
                                         rehearsal for prod)  APPROVAL required
```

| Environment | Branch | Deployment style | Purpose |
|---|---|---|---|
| Development | `dev` | Direct recreate, no approval | Engineering iteration, not held to the continuous-operation standard |
| Preproduction | `ppr` | Rolling, through redundancy pair | Dress rehearsal for the production rollout mechanism itself; FAT/SAT/UAT and real vendor-sandbox connector validation happen here |
| Production | `main` | Rolling, through redundancy pair | Manual approval required via GitHub Environment protection rules; on-prem inside the customer's OT security zone by default |

Promote changes in order: feature branch → PR to `dev` → PR from `dev` to `ppr` → PR from `ppr` to `main`. The workflow validates these source/target pairs and rejects fork-based promotion, including a fork branch named `dev` or `ppr`. Do not push directly to `ppr` or `main`; this applies to administrators and apps as well as contributors. The ruleset configuration below has no bypass actors. `dev` is not included in that ruleset and therefore is not protected against direct pushes by this configuration.

Push-triggered CI and deployment jobs intentionally remain enabled: GitHub emits a `push` event after a PR merge, which is how post-merge build/deploy work starts. That event does not authorize direct pushes; enforcement comes from the active GitHub ruleset.

Runtime, RTDB, Alarm Management, and Historian stay on-premises inside the customer's OT-segmented network by default, consistent with IEC 62443 / NIST SP 800-82 industrial security posture. Cloud (Azure, for stack-consistency with .NET/Entra ID/SQL Server) is limited to non-control-critical slices: central monitoring, license management, remote diagnostics.

---

## CI/CD Pipeline

`.github/workflows/i2p-ci.yml` runs on every PR into `dev`, `ppr`, or `main`, plus a weekly scheduled dependency scan. PR body edits and retargeting are revalidated. Review submission, edits, and dismissals re-evaluate sensitive-change confirmation.

```
PR opened
   │
   ├─▶ pr-metadata ──────────── requirement ID referenced in PR description?
   ├─▶ promotion-check ──────── same-repository feature→dev→ppr→main only?
   ├─▶ secret-scan ───────────── full git history, Gitleaks
   ├─▶ build ─────────────────── restore, format, build, SonarQube quality gate (blocking)
   │       │
   │       ├─▶ platform-tests ─────── Domain, Application, Api, Architecture (matrix)
   │       │       └─▶ coverage-gate ─ Domain + Application only, 80% threshold
   │       ├─▶ connector-contract-tests ─ Sap/Mes/Cmms/Gis/Lims, WireMock only (matrix)
   │       └─▶ integration ────────── real SQL Server + RabbitMQ via service containers
   ├─▶ dependency-scan ────────── NuGet vulnerable + transitive package check
   └─▶ sensitive-review ─────── explicit non-author approval and negative-path confirmation when needed
           │
           ▼
     all-checks (required by the main/ppr ruleset after admin activation)

push after merge to dev / ppr / main
   │
   └─▶ docker-build ──▶ deploy-{dev|ppr|production}
                          (rolling through redundancy pair, manual approval on production)
```

The `all-checks` status fails closed unless every required PR job succeeds; failed, cancelled, skipped, and missing jobs are failures. The SonarQube quality gate is required for PRs targeting `ppr` or `main`, so those checks fail if `SONAR_TOKEN`, `SONAR_HOST_URL`, or `SONAR_ORGANIZATION` is not configured. Configure a least-privilege Sonar token as the `SONAR_TOKEN` and `SONAR_HOST_URL` Actions secrets and `SONAR_ORGANIZATION` Actions variable before rollout. Fork PRs cannot access repository secrets and will remain blocked from protected-branch promotion until their changes are submitted from a same-repository branch. Do not use `pull_request_target` to work around this. The latest inspected scheduled CI run also failed during restore because `System.Security.Cryptography.Pkcs` and `System.Security.Cryptography.Xml` package versions were reported vulnerable; resolve that dependency issue separately before expecting all required checks to pass.

The current `deploy-*` jobs are echo-only stubs; they do not deploy or enforce the rollout behavior described above. The README describes the intended environment flow, not completed deployment automation.

The referenced `Platform.Docs/PR_Code_Standards_Checklist_v3_Complete.md` and governing documents are not present in this checkout. Do not infer or invent their contents or requirement IDs.

---

## Testing Strategy

| Layer | How | Rule |
|---|---|---|
| Domain | Unit tests, zero mocks | Pure logic, no excuse to skip coverage |
| Application | Unit tests, mocked ports | Orchestration only, no real infrastructure |
| Connectors | Contract tests against WireMock fixtures | Never call a live vendor system in CI; sandbox validation still required once before a connector ships |
| Integration | Testcontainers, real SQL Server + RabbitMQ | In-memory fakes hide real database behavior differences |
| Architecture | NetArchTest | Fails the build if Domain references anything beyond the BCL, or a module boundary is crossed directly |

---

## Security

Full checklist in `Platform.Docs/Cursor_Security_Audit_Prompt.md`. Non-negotiables:

- No secret, credential, or connection string in source, ever. `ISecretsProvider` only.
- Every resource-scoped endpoint checks ownership, not just authentication (prevents horizontal privilege escalation).
- EF Core and Dapper queries are parameterized, no string concatenation into SQL.
- Every NuGet package is verified against the official registry before merge (hallucinated/typosquatted package check).
- No local password hashing exists anywhere; authentication is fully delegated to the chosen identity provider.

---

## Getting Started

```bash
git clone <repo>
cd Platform.I2P
dotnet restore Platform.I2P.sln
dotnet build Platform.I2P.sln -c Release
dotnet test Platform.I2P.sln          # requires Docker running for Integration.Tests
```

Docker is required locally for `Platform.I2P.Integration.Tests` (Testcontainers spins up real SQL Server and RabbitMQ). If Docker isn't running, that project's tests fail rather than silently skip, treat that as a blocking condition, not a pass.

---

## Contributing

Every PR must:
1. Reference a requirement ID from `PSRS-001` in its description (`FR-XXX-000` or `NFR-XXX-000`).
2. Pass every job in `i2p-ci.yml`.
3. Get an approval from a non-author reviewer for the current PR revision if it touches auth, security, secrets, identity, or encryption. The reviewer must include `Negative-path coverage: CONFIRMED` in the approval review body. A template checkbox or the workflow's file detection alone is not confirmation.

Full standards: `Platform.Docs/PR_Code_Standards_Checklist_v3_Complete.md`.

### Activating PR-only protection for `main` and `ppr`

The committed file `.github/config/main-ppr-ruleset.json` is an importable configuration example, **not an active policy**. No repository settings were changed by committing it. A repository administrator must:

1. Review the JSON and current repository rulesets first. Existing rulesets have not been verified; preserve and reconcile any existing rules rather than replacing them blindly.
2. In **Settings → Rules → Rulesets**, import/create the branch ruleset from this file. Confirm it is active, targets exactly `refs/heads/main` and `refs/heads/ppr`, has an empty bypass list, requires one approval (not by the author or last pusher), dismisses stale approvals, resolves review threads, requires the `all-checks` status from GitHub Actions, and requires up-to-date branches. It blocks force pushes and deletion, and deliberately does not restrict updates (which would also block PR merges).
3. Verify `all-checks` is available from the GitHub Actions integration and that the imported ruleset's required-check source is GitHub Actions. Confirm the effective policy for both refs in Settings after activation.
4. Complete the workflow rollout through PRs: merge the policy workflow to `dev`, then PR `dev` → `ppr`, then PR `ppr` → `main`. A target branch must contain the workflow for its PR check to run. On `ppr`/`main`, activate the ruleset only after that branch has the workflow and its check is reported successfully. The first import should still be followed by an administrator's effective-policy review.
5. Verify in an isolated scratch repository with the same active ruleset that a disposable empty commit cannot be pushed directly to its `main` or `ppr`, while a compliant PR can merge. In this repository, verify the active effective-ruleset display has the exact refs and empty bypass list; do not attempt a direct push here, even with an empty commit. These checks verify rejection behavior without risking changes to this repository's protected branch contents.

GitHub branch rulesets can provide this enforcement only when the repository's plan supports rulesets for its visibility. For a private personal repository, GitHub Pro or higher is required. The available context did not verify the subscription, effective rulesets, or current settings, so protection remains unconfirmed until an administrator performs and verifies these steps. The ruleset requires review, checks, and no bypass actors, but a committed JSON file alone cannot block a Git push.

The `dev` branch is intentionally outside this ruleset; protect it separately if direct pushes to `dev` must also be prohibited. Do not add an administrator/app bypass to make promotion easier.

## Governing Documents

| Document | Purpose |
|---|---|
| `PSRS-001` | Requirements baseline (functional + non-functional, 4,550 requirements) |
| `IMP-PLAN-001` | Implementation dependency and parallel workstream plan |
| `RTM-001` | Master requirements traceability matrix |
| `Cursor_I2P_Implementation_Prompt.md` | Architecture and build-order brief this solution was generated from |
| `Cursor_Security_Audit_Prompt.md` | Pre-ship security audit checklist |
| `PR_Code_Standards_Checklist_v3_Complete.md` | Complete PR standards, source of truth for CI enforcement |
