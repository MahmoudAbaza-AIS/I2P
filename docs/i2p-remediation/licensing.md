# WP9 — NuGet Licensing Report

**Checkout:** `origin/dev` @ `292f045` (post-WP0)  
**Branch:** `fix/i2p-wp9-licensing`  
**Date (UTC):** 2026-11-02  
**Method:** `dotnet list Platform.I2P.sln package --include-transitive` → NuGet registration/catalog `licenseExpression` (or `licenseUrl` when expression absent).  
**Evidence:** `evidence/wp9-packages-list.log`, `evidence/wp9-nuget-licenses.csv` (324 unique package×version rows).  
**Package changes in this WP:** **none** (report only).

> Legal note: SPDX / catalog metadata is evidence for engineering triage, not a substitute for counsel review. Flagged commercial/RPL items need Mahmoud’s D7 decision.

---

## 1. Executive summary (D7-critical)

| Package | In graph? | Current version | Catalog / effective license | Exposure today | Last permissive line | Options (do not execute without D7) |
|---------|-----------|-----------------|-----------------------------|----------------|----------------------|-------------------------------------|
| **MassTransit** (+ RabbitMQ, EF Core pkgs) | **Yes** (direct in Infrastructure) | **8.5.2** | **Apache-2.0** | OK for commercial use under Apache-2.0. v9+ is commercial (MassTransit Inc.). | **8.x** (stay on 8.5.2; security patches announced through 2026 per prompt) | (a) pin 8.x (b) buy MassTransit v9+ (c) replace (e.g. Wolverine, raw RabbitMQ) |
| **MediatR** | **Yes** (direct in Application) | **12.5.0** | **Apache-2.0** | OK. v13+ is RPL-1.5 / commercial (Lucky Penny). | **12.5.0** (last Apache-2.0 release per vendor FAQ) | (a) pin ≤12.5.0 (b) buy / Community tier if eligible (c) plain handlers / Wolverine |
| **FluentAssertions** | **Yes** (direct in **all test** projects) | **8.6.0** | NuGet: deprecated license URL; **effective: Xceed Community License (non-commercial) / paid commercial** | **LIVE commercial exposure** if I2P is developed/tested by a revenue-earning org | **7.x** Apache-2.0 | (a) buy Xceed license (b) pin 7.x (c) move to **AwesomeAssertions** / Shouldly |
| **AutoMapper** | **No** | — | — | None today | n/a (avoid ≥15 without D7) | Do not add ≥15 without decision |
| **Duende IdentityServer** / Duende SDK | **No package** | — | Commercial product if adopted | None in NuGet graph; README/`Program.cs` only mention Duende as possible JWT authority (provider-agnostic JWT today) | n/a | Tied to **D8**; stay agnostic until decided |

**Immediate action required (recommendation only — not approved):** treat FluentAssertions 8.6.0 as the only **current** licensing breach risk for commercial use of this repo’s test suite.

---

## 2. Direct package inventory (solution projects)

Licenses from NuGet catalog unless noted.

### Production / src

| Package | Version | Project(s) | SPDX / catalog | Commercial/RPL flag |
|---------|---------|------------|----------------|---------------------|
| Asp.Versioning.Mvc | 8.1.0 | Api | MIT | No |
| Microsoft.AspNetCore.Authentication.JwtBearer | 10.0.12 | Api | MIT | No |
| Microsoft.AspNetCore.OpenApi | 10.0.12 | Api | MIT | No |
| Microsoft.EntityFrameworkCore.Design | 10.0.12 | Api | MIT | No |
| Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore | 10.0.12 | Api | MIT | No |
| Microsoft.OpenApi | 2.12.0 | Api | MIT | No |
| OpenTelemetry.* (Exporter/Hosting/AspNetCore/Http) | 1.19.x | Api | Apache-2.0 | No |
| Scalar.AspNetCore | 1.2.61 | Api | MIT | No |
| Serilog.AspNetCore / Enrichers.* | 9.0.0 / 3.0.1 / 4.0.0 | Api | Apache-2.0 | No |
| System.Security.Cryptography.Pkcs | 10.0.13 | Api, Infrastructure | MIT | No (D-10 pin) |
| System.Security.Cryptography.Xml | 10.0.13 | Infrastructure | MIT | No (D-10 pin) |
| FluentValidation (+ DI extensions) | 12.0.0 | Application | Apache-2.0 | No |
| **MediatR** | **12.5.0** | Application | **Apache-2.0** | **Pin; do not go to 13+ without D7** |
| Microsoft.Extensions.* (Abstractions etc.) | 10.0.0 | Application, connectors | MIT | No |
| **MassTransit** | **8.5.2** | Infrastructure | **Apache-2.0** | **Pin; do not go to 9+ without D7** |
| **MassTransit.EntityFrameworkCore** | **8.5.2** | Infrastructure | **Apache-2.0** | Same; unused today (D-08) |
| **MassTransit.RabbitMQ** | **8.5.2** | Infrastructure | **Apache-2.0** | Same |
| Microsoft.EntityFrameworkCore (+ SqlServer, Design) | 10.0.0 | Infrastructure | MIT | No |
| Microsoft.Extensions.Hosting / Http / Http.Polly / Options.ConfigurationExtensions | 10.0.0 | Infrastructure, connectors | MIT | No |
| Polly | 8.6.3 | Infrastructure, connectors | BSD-3-Clause | No |
| Polly.Extensions.Http | 3.0.0 | Infrastructure, connectors | BSD-3-Clause | No |
| Serilog | 4.3.0 | Infrastructure | Apache-2.0 | No |
| Domain / Contracts | — | — | no NuGet | — |

### Test

| Package | Version | SPDX / catalog | Commercial/RPL flag |
|---------|---------|----------------|---------------------|
| **FluentAssertions** | **8.6.0** | See §1 (Xceed dual / commercial for commercial use) | **YES — live exposure** |
| coverlet.collector | 6.0.4 | MIT | No |
| Microsoft.NET.Test.Sdk | 17.14.1 | MIT | No |
| xunit / xunit.runner.visualstudio | 2.9.3 / 3.1.4 | Apache-2.0 | No |
| NSubstitute | 5.3.0 | BSD / catalog | No |
| NetArchTest.Rules | 1.3.2 | UNKNOWN on NuGet catalog (verify manually) | Review |
| WireMock.Net | 2.15.0 | Apache-2.0 | No |
| Testcontainers (+ MsSql, RabbitMq) | 4.15.0 | MIT | No |
| Microsoft.AspNetCore.Mvc.Testing | 10.0.0 | MIT | No |
| Microsoft.EntityFrameworkCore.InMemory | 10.0.0 | MIT | No |
| System.IdentityModel.Tokens.Jwt | 8.19.2 | MIT | No |

---

## 3. Full transitive graph

- **324** unique `(Id, Version)` rows after de-duplication across projects.  
- Full machine-readable table: [`evidence/wp9-nuget-licenses.csv`](evidence/wp9-nuget-licenses.csv).  
- Distribution (catalog expressions): **MIT ≈ 255**, **Apache-2.0 ≈ 46**, **BSD-3-Clause ≈ 4**, remainder URL-only / UNKNOWN / 1 FETCH_FAILED (`Microsoft.Extensions.Logging.EventSource` 10.0.0).

URL-only entries are typically MIT/Apache via linked LICENSE files (AspNetCore 2.x legacy packages, xunit.abstractions, etc.). Treat as **needs spot-check**, not automatic commercial flags.

---

## 4. Deep dive — packages named in the remediation prompt

### 4.1 MassTransit 8.5.2

- **Current:** Apache-2.0 (catalog confirmed for MassTransit, Abstractions, RabbitMQ, EntityFrameworkCore 8.5.2).  
- **v9+:** commercial (MassTransit Inc.) — **do not upgrade** without D7.  
- **Replacement options if leaving MassTransit:** Wolverine, raw RabbitMQ.Client + custom outbox (aligns with D1 option b), NServiceBus (also commercial).  
- **D1 interaction:** adopting MassTransit EF Core transactional outbox (D1 option a) stays on **8.x** Apache-2.0 if pinned; moving to v9 features would force a commercial decision under D7.

### 4.2 MediatR 12.5.0

- **Current:** Apache-2.0.  
- **v13+:** RPL-1.5 or Lucky Penny commercial (license key); Community tier under revenue threshold exists per vendor FAQ — still a policy choice.  
- **Replacement:** plain `IRequestHandler`-style classes without MediatR, or Wolverine mediators.

### 4.3 FluentAssertions 8.6.0 — **active risk**

- Present in **every** test project.  
- v8+ requires paid Xceed license for commercial use; v7.x remains Apache-2.0.  
- **Alternatives:** pin `FluentAssertions` 7.x; or migrate to **AwesomeAssertions** (Apache-2.0 fork) / Shouldly.

### 4.4 AutoMapper

- **Not referenced.** Adding AutoMapper ≥15 would introduce RPL-1.5/commercial (Lucky Penny). Prefer not introducing it; if mapping libraries are needed later, evaluate under D7.

### 4.5 Duende IdentityServer

- **Not in NuGet graph.** Runtime uses standard JWT bearer (`Authority`/`Audience`).  
- Choosing Duende as IdP (D8) would introduce **commercial** Duende licensing separate from NuGet “pin” issues. Stay provider-agnostic until D8.

---

## 5. Recommendation for D7 (not approval)

1. **Immediate:** decide FluentAssertions path (buy vs pin 7.x vs AwesomeAssertions/Shouldly) — only current live exposure.  
2. **Policy:** pin MassTransit `<9`, MediatR `≤12.5.0`, ban AutoMapper `≥15` and MassTransit `≥9` in Directory.Build / dependabot rules until revisited.  
3. **D1:** prefer solutions that work on MassTransit **8.5.2** Apache-2.0 (custom outbox fix **or** MT EF outbox on v8) unless purchasing v9 is intentional.  
4. **Duende:** defer to D8; no package action in WP9.

---

## 6. STOP — D7

No packages were changed in this work package. Proceeding to WP1 requires Mahmoud’s recorded D7 decision (and then D1).
