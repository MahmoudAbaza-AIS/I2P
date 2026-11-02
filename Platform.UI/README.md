# Platform.UI

Angular standalone SPA for the Industrial SCADA Automation Platform. Initial scope: reusable application shell plus the first I2P vertical slice (integration health + exchange history).

## Stack (verified pins)

| Concern | Choice |
|---------|--------|
| Framework | Angular 21.2.x (standalone + signals) |
| Components | PrimeNG 21.1.x + free Aura theme |
| Layout | Tailwind CSS 4.x |
| i18n | Transloco (en/ar, runtime RTL) |
| Auth | angular-oauth2-oidc (Auth Code + PKCE) |
| Charts | Apache ECharts 6 (host ready; trends deferred — no API) |
| Realtime | Deferred — Platform.I2P has no SignalR hubs |
| API | OpenAPI snapshot + ng-openapi-gen; handwritten typed façade for incomplete response schemas |
| Package manager | npm (`package-lock.json`) |

Node: **24.13.x** supported. Angular 22 requires Node ≥ 24.15 and is deferred.

## Quick start

```bash
cd Platform.UI
npm ci
npm start
```

Dev server proxies `/api`, `/health`, `/openapi` to `http://localhost:5044` (see `proxy.conf.json`).

Runtime config: `public/config.json` (no secrets). Set `oidc.authority` and `oidc.clientId` after D8.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm start` | Dev server + API proxy |
| `npm run build` | Production build |
| `npm run test` / `test:ci` | Vitest unit/component tests |
| `npm run api:fetch` | Download OpenAPI from running API |
| `npm run api:generate` | Regenerate `src/app/generated/api` |
| `npm run api:refresh` | Fetch + generate |

## Documentation

- [Architecture](docs/architecture.md)
- [API generation](docs/api-generation.md)
- [Auth / session](docs/auth-session.md)
- [Deployment](docs/deployment.md)
- [Accessibility](docs/accessibility.md)

## Blocked / deferred

- **D8 IdP** — live OIDC against Entra/Duende
- **CORS on API** — production cross-origin needs a separate backend change; local proxy used
- **SignalR** — no hubs in Platform.I2P
- **Trend charts** — no live trend API in current source controllers
- **OpenAPI response schemas** for health/exchanges — see api-generation.md
