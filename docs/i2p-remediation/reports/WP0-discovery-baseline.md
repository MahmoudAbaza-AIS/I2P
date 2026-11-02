# WP0 Report — Discovery and Baseline

## 1. WP / branch / PR

- **WP:** WP0
- **Branch:** `fix/i2p-wp0-discovery-baseline`
- **PR:** https://github.com/MahmoudAbaza-AIS/I2P/pull/8

## 2. Done

- Verified WP-00 gate; branched from `origin/dev` @ `923fc13`
- Baseline inventory written: `docs/i2p-remediation/00-baseline.md`
- Confirmed D-01…D-11, A-01…A-09, N-01…N-16 against checkout
- Fixed D-10: Pkcs/Xml → 10.0.13; vulnerable list clean
- Fixed pre-existing Api.Tests 404s (routes → `/api/v1/...` after versioning)
- PROGRESS.md + traceability.csv initialized
- No control-layer write paths found

## 3. Tests

- No new product tests required for WP0 discovery
- Route fix in `SecurityNegativePathTests` (5 URLs)
- Full suite: see `evidence/wp0-test-final.log` (expected all pass)

## 4. Requirement IDs

- NFR-INT-061, NFR-INT-066
- `REQ-ID-NEEDED: vulnerability-management (NFR-SEC)` for D-10
- FR-API-080 (WP-00 context, already closed)

## 5. Open risks / deviations

- API route test fix was outside the literal “D-10 only” code change but required for rule 0.1.7 (tests green before PR); documented as pre-existing drift from API versioning on main
- Full SPDX licensing deferred to WP9 (intentional)
- Orphan Connectors.Erp/Sql/Oracle/Api projects on disk, not in solution

## 6. Next

- Merge WP0 → `dev`
- **WP9** licensing report → **STOP D7**
- Then WP1 gated by D1 (depends on D7)
