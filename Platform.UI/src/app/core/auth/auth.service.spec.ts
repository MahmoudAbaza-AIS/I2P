import { TestBed } from '@angular/core/testing';
import { OAuthService } from 'angular-oauth2-oidc';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service';
import { RUNTIME_CONFIG } from '../config/runtime-config.loader';
import { DEFAULT_RUNTIME_CONFIG, RuntimeConfig } from '../config/runtime-config';

/** Minimal OAuthService stub using Vitest mocks. */
function createOAuthServiceStub() {
  return {
    configure: vi.fn(),
    setStorage: vi.fn(),
    loadDiscoveryDocumentAndTryLogin: vi.fn().mockResolvedValue(undefined),
    hasValidAccessToken: vi.fn().mockReturnValue(false),
    getAccessToken: vi.fn().mockReturnValue(null),
    getIdentityClaims: vi.fn().mockReturnValue(null),
    logOut: vi.fn(),
    initCodeFlow: vi.fn(),
  };
}

describe('AuthService — unconfigured (no authority)', () => {
  let service: AuthService;
  let oauthStub: ReturnType<typeof createOAuthServiceStub>;

  beforeEach(() => {
    oauthStub = createOAuthServiceStub();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: OAuthService, useValue: oauthStub },
        { provide: RUNTIME_CONFIG, useValue: DEFAULT_RUNTIME_CONFIG },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should report isConfigured() as false when authority is empty', () => {
    expect(service.isConfigured()).toBe(false);
  });

  it('should not call OAuthService.configure when authority is empty', async () => {
    await service.initialize();
    expect(oauthStub.configure).not.toHaveBeenCalled();
  });

  it('should not call initCodeFlow on login() when unconfigured', () => {
    service.login();
    expect(oauthStub.initCodeFlow).not.toHaveBeenCalled();
  });
});

describe('AuthService — configured', () => {
  let service: AuthService;
  let oauthStub: ReturnType<typeof createOAuthServiceStub>;

  const configuredRuntime: RuntimeConfig = {
    ...DEFAULT_RUNTIME_CONFIG,
    oidc: {
      authority: 'https://auth.example.com/realms/test',
      clientId: 'platform-ui',
      audience: 'platform-i2p',
      scopes: 'openid profile roles',
      requireHttps: false,
    },
  };

  beforeEach(() => {
    oauthStub = createOAuthServiceStub();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: OAuthService, useValue: oauthStub },
        { provide: RUNTIME_CONFIG, useValue: configuredRuntime },
      ],
    });

    service = TestBed.inject(AuthService);
  });

  it('should report isConfigured() as true', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('should call OAuthService.configure on initialize()', async () => {
    await service.initialize();
    expect(oauthStub.setStorage).toHaveBeenCalledWith(sessionStorage);
    expect(oauthStub.configure).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: configuredRuntime.oidc.authority })
    );
  });

  it('should set authState to "unauthenticated" when no valid token after init', async () => {
    oauthStub.hasValidAccessToken.mockReturnValue(false);
    await service.initialize();
    expect(service.authState()).toBe('unauthenticated');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should set authState to "authenticated" when valid token exists after init', async () => {
    oauthStub.hasValidAccessToken.mockReturnValue(true);
    await service.initialize();
    expect(service.authState()).toBe('authenticated');
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should call initCodeFlow on login()', () => {
    service.login();
    expect(oauthStub.initCodeFlow).toHaveBeenCalled();
  });

  it('should call logOut and set state to unauthenticated on logout()', () => {
    service.logout();
    expect(oauthStub.logOut).toHaveBeenCalled();
    expect(service.authState()).toBe('unauthenticated');
  });

  it('should return null token when OAuthService returns empty string', () => {
    oauthStub.getAccessToken.mockReturnValue('');
    expect(service.getAccessToken()).toBeNull();
  });

  it('should return access token string when authenticated', () => {
    oauthStub.getAccessToken.mockReturnValue('test.access.token');
    expect(service.getAccessToken()).toBe('test.access.token');
  });

  it('should report hasRole correctly from ID token claims', () => {
    oauthStub.getIdentityClaims.mockReturnValue({ roles: ['Integration.Reader'] });
    expect(service.hasRole('Integration.Reader')).toBe(true);
    expect(service.hasRole('Admin')).toBe(false);
  });

  it('should handle array roles claim', () => {
    oauthStub.getIdentityClaims.mockReturnValue({
      roles: ['Integration.Reader', 'Operator'],
    });
    expect(service.hasRole('Operator')).toBe(true);
  });
});
