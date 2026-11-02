/**
 * Runtime configuration loaded from /config.json at app startup.
 * This file is served from the `public` folder and is NOT bundled —
 * it can be replaced per-environment without rebuilding the app.
 */

export interface OidcConfig {
  /** OIDC authority URL (e.g. https://auth.example.com/realms/platform). Empty = OIDC disabled. */
  authority: string;
  /** OAuth2 client ID registered for this SPA. */
  clientId: string;
  /** Token audience claim expected by the backend. */
  audience: string;
  /** Space-separated scope string. */
  scopes: string;
  /** Set false for local development (allows http:// redirect URIs). */
  requireHttps: boolean;
}

export interface FeatureFlags {
  /** Enable real-time dashboard via SignalR (not yet implemented). */
  realtimeDashboard: boolean;
  /** Enable historical trend charts via ECharts (deferred). */
  trendCharts: boolean;
}

export interface RuntimeConfig {
  /** Base URL for all backend API calls. Default: "/api/v1". */
  apiBaseUrl: string;
  oidc: OidcConfig;
  features: FeatureFlags;
}

/** Sentinel returned before config.json has finished loading. */
export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = {
  apiBaseUrl: '/api/v1',
  oidc: {
    authority: '',
    clientId: '',
    audience: 'platform-i2p',
    scopes: 'openid profile roles',
    requireHttps: true,
  },
  features: {
    realtimeDashboard: false,
    trendCharts: false,
  },
};
