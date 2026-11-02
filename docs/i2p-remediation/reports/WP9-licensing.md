# WP9 Report — Licensing

## 1. WP / branch / PR
- WP9 / `fix/i2p-wp9-licensing` / 

## 2. Done
- Inventories 324 unique package×version rows with NuGet license metadata
- Deep-dive MassTransit, MediatR, FluentAssertions, AutoMapper, Duende
- Wrote `licensing.md` and `decisions/D07-licensing.md`
- **No package version changes**

## 3. Tests
- None required (docs-only). Restore used only to list packages.

## 4. Requirement IDs
- `REQ-ID-NEEDED: package-licensing-policy` (no Appendix A ID for commercial NuGet policy)

## 5. Open risks
- FluentAssertions 8.6.0 live commercial exposure in all test projects
- D1 blocked until D7

## 6. Next
- **STOP D7** — Mahmoud must record decision in D07 before WP1
