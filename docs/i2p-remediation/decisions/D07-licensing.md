# D7 — Licensing for MassTransit / MediatR / FluentAssertions / AutoMapper / Duende

**Status:** AWAITING MAHMOUD DECISION  
**Raised in:** WP9  
**Blocks:** D1 (outbox implementation), and any major upgrade of the listed packages  
**Evidence:** `docs/i2p-remediation/licensing.md`

## Context

Verified on `origin/dev` @ `292f045`:

| Package | Current | License posture |
|---------|---------|-----------------|
| MassTransit 8.5.2 | In use | Apache-2.0 — OK; v9+ commercial |
| MediatR 12.5.0 | In use | Apache-2.0 — OK; v13+ RPL-1.5 / commercial |
| FluentAssertions 8.6.0 | In **all** test projects | **Commercial for commercial use** (Xceed) — **live exposure** |
| AutoMapper | Not present | ≥15 would be RPL/commercial |
| Duende IdentityServer | Not in NuGet graph | Commercial if chosen as IdP (D8) |

WP1’s D1 choice (MassTransit EF outbox vs custom outbox) must remain compatible with whatever D7 allows for MassTransit major versions.

## Options (≥2)

### Option A — Pay where required; stay current majors when needed
- Buy FluentAssertions (Xceed) commercial license for the team.
- Keep MassTransit 8.x and MediatR 12.x until a paid upgrade is justified; optionally purchase MassTransit v9 / MediatR v13 later.
- Duende: decide under D8 if/when needed.

**Benefits:** Minimal code churn; can adopt vendor-supported majors later.  
**Costs:** Recurring license spend; procurement lead time.  
**Blast radius:** Low code risk; budget/process risk.

### Option B — Pin to last permissive versions / OSS replacements (recommended default)
- FluentAssertions: pin **7.x** Apache-2.0 **or** migrate to **AwesomeAssertions** / Shouldly.
- MassTransit: **pin &lt; 9** (remain on 8.5.2).
- MediatR: **pin ≤ 12.5.0**.
- AutoMapper: do not introduce ≥15 (prefer none).
- Duende: do not add package until D8.

**Benefits:** No new commercial entitlements; unblocks D1 on Apache-2.0 MassTransit 8.x.  
**Costs:** FluentAssertions downgrade/migration effort in tests; forgo v9/v13 features.  
**Blast radius:** Test projects only for FA; Directory.Build / renovate guards for pins.

### Option C — Replace commercial-prone stacks
- Replace MassTransit with Wolverine or custom RabbitMQ + outbox (ties to D1-b).
- Replace MediatR with plain handlers.
- Replace FluentAssertions with AwesomeAssertions/Shouldly.
- Never take Duende; use Entra ID / other (D8).

**Benefits:** Long-term license simplicity.  
**Costs:** Largest engineering effort; overlaps WP1/WP8.  
**Blast radius:** Application, Infrastructure, all tests.

## Recommendation

**Option B** for now: eliminate FluentAssertions 8 commercial exposure; hard-pin MassTransit &lt;9 and MediatR ≤12.5.0; keep AutoMapper/Duende out of the graph. Revisit paid upgrades only with explicit need.

This keeps **D1** implementable on MassTransit **8.5.2** (either EF outbox on v8 or custom outbox) without buying MassTransit v9.

## Decision needed from Mahmoud

Please choose **A / B / C** (or a hybrid), and specifically:

1. FluentAssertions: **buy** / **pin 7.x** / **AwesomeAssertions** / **Shouldly**  
2. MassTransit: **pin 8.x** / **buy v9+** / **replace**  
3. MediatR: **pin ≤12.5.0** / **buy/Community v13+** / **replace**  
4. AutoMapper policy: **ban ≥15** / **allow with purchase**  
5. Duende: defer to D8 confirmation  

**Record approval below — do not treat this recommendation as approval.**

## Approval record

- Decision: _pending_  
- Date: _pending_  
- Scope: _pending_  
- Approver: Mahmoud  
