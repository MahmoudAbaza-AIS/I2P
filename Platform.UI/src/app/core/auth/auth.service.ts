import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { AuthConfig, OAuthService } from 'angular-oauth2-oidc';
import { RUNTIME_CONFIG } from '../config/runtime-config.loader';

export type AuthState = 'unconfigured' | 'unauthenticated' | 'authenticated' | 'error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly oauthService = inject(OAuthService);
  private readonly config = inject(RUNTIME_CONFIG);

  /** Whether an OIDC authority is configured at runtime. */
  readonly isConfigured: Signal<boolean> = computed(
    () => !!this.config.oidc.authority && !!this.config.oidc.clientId
  );

  private readonly _authState = signal<AuthState>(
    this.config.oidc.authority ? 'unauthenticated' : 'unconfigured'
  );

  readonly authState: Signal<AuthState> = this._authState.asReadonly();
  readonly isAuthenticated: Signal<boolean> = computed(
    () => this._authState() === 'authenticated'
  );

  /**
   * Initialise OIDC discovery + silent login attempt.
   * Call once from app.config.ts APP_INITIALIZER (after runtime config is loaded).
   * Does nothing if authority is not configured.
   */
  async initialize(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const oidc = this.config.oidc;

    const authConfig: AuthConfig = {
      issuer: oidc.authority,
      clientId: oidc.clientId,
      redirectUri: window.location.origin + '/callback',
      responseType: 'code',
      scope: oidc.scopes,
      requireHttps: oidc.requireHttps,
      useSilentRefresh: false,
      showDebugInformation: !isProduction(),
      sessionChecksEnabled: false,
      clearHashAfterLogin: true,
      oidc: true,
      customQueryParams: oidc.audience
        ? { audience: oidc.audience }
        : undefined,
    };

    this.oauthService.configure(authConfig);
    this.oauthService.setStorage(sessionStorage);

    try {
      await this.oauthService.loadDiscoveryDocumentAndTryLogin();

      if (this.oauthService.hasValidAccessToken()) {
        this._authState.set('authenticated');
      } else {
        this._authState.set('unauthenticated');
      }
    } catch (err) {
      console.error('[AuthService] OIDC initialisation failed:', err);
      this._authState.set('error');
    }
  }

  /** Redirect to OIDC provider for login (AuthCode + PKCE). */
  login(): void {
    if (!this.isConfigured()) {
      console.warn('[AuthService] Cannot login — OIDC not configured.');
      return;
    }
    this.oauthService.initCodeFlow();
  }

  /** Clear tokens and redirect to provider logout endpoint if available. */
  logout(): void {
    this.oauthService.logOut();
    this._authState.set('unauthenticated');
  }

  /** Returns the raw access token, or null if not authenticated. */
  getAccessToken(): string | null {
    const token = this.oauthService.getAccessToken();
    return token || null;
  }

  /**
   * Checks whether the current user has at least one of the specified roles.
   * Roles are read from the `roles` claim in the ID token.
   */
  hasRole(...roles: string[]): boolean {
    const claims = this.oauthService.getIdentityClaims() as Record<string, unknown> | null;
    if (!claims) return false;

    const userRoles: string[] = Array.isArray(claims['roles'])
      ? (claims['roles'] as string[])
      : typeof claims['roles'] === 'string'
        ? [claims['roles'] as string]
        : [];

    return roles.some((r) => userRoles.includes(r));
  }

  /**
   * Called by the OIDC callback route to complete the login flow.
   * angular-oauth2-oidc handles the code exchange automatically on
   * loadDiscoveryDocumentAndTryLogin(); this method updates internal state.
   */
  completeLogin(): void {
    if (this.oauthService.hasValidAccessToken()) {
      this._authState.set('authenticated');
    }
  }
}

function isProduction(): boolean {
  // Angular sets this at build time; fall back to hostname check.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalThis as any)['ngDevMode'] === false;
  } catch {
    return window.location.hostname !== 'localhost';
  }
}
