import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HealthPageComponent } from './health-page.component';
import { IntegrationHealthDto } from '../../data/integration.models';
import { RUNTIME_CONFIG } from '../../../../core/config/runtime-config.loader';
import { DEFAULT_RUNTIME_CONFIG } from '../../../../core/config/runtime-config';
import { TranslocoHttpLoader } from '../../../../core/i18n/transloco-loader';

const MOCK_HEALTH: IntegrationHealthDto[] = [
  {
    connector: 'SAP-PI',
    isHealthy: true,
    status: 'Healthy',
    checkedAtUtc: '2026-11-02T08:00:00Z',
    detail: null,
  },
  {
    connector: 'ERP-Gateway',
    isHealthy: false,
    status: 'Unhealthy',
    checkedAtUtc: '2026-11-02T07:58:00Z',
    detail: 'Connection timeout',
  },
];

describe('HealthPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HealthPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTransloco({
          config: {
            availableLangs: ['en'],
            defaultLang: 'en',
            reRenderOnLangChange: false,
            prodMode: true,
            missingHandler: {
              allowEmpty: true,
              logMissingKey: false,
              useFallbackTranslation: false,
            },
          },
          loader: TranslocoHttpLoader,
        }),
        { provide: RUNTIME_CONFIG, useValue: DEFAULT_RUNTIME_CONFIG },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.match(() => true).forEach((r) => r.flush({}));
    httpMock.verify();
  });

  function createAndFlush(
    body: object | object[] | null,
    opts?: { status: number; statusText: string }
  ): HealthPageComponent {
    const fixture = TestBed.createComponent(HealthPageComponent);
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/v1/integration/health');
    if (opts) {
      req.flush(body, opts);
    } else {
      req.flush(body);
    }
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('should create the component', () => {
    const component = createAndFlush([]);
    expect(component).toBeTruthy();
  });

  it('should set pageState to "loaded" when API returns data', () => {
    const component = createAndFlush(MOCK_HEALTH);
    expect(component['pageState']()).toBe('loaded');
    expect(component['connectors']()).toHaveLength(2);
  });

  it('should set pageState to "empty" when API returns empty array', () => {
    const component = createAndFlush([]);
    expect(component['pageState']()).toBe('empty');
  });

  it('should set pageState to "error" on 500 response', () => {
    const component = createAndFlush(
      { error: 'Server error' },
      { status: 500, statusText: 'Internal Server Error' }
    );
    expect(component['pageState']()).toBe('error');
  });

  it('should set pageState to "unauthorized" on 401 response', () => {
    const component = createAndFlush({}, { status: 401, statusText: 'Unauthorized' });
    expect(component['pageState']()).toBe('unauthorized');
  });

  it('should set pageState to "unauthorized" on 403 response', () => {
    const component = createAndFlush({}, { status: 403, statusText: 'Forbidden' });
    expect(component['pageState']()).toBe('unauthorized');
  });

  it('should reload data when load() is called again', () => {
    const fixture = TestBed.createComponent(HealthPageComponent);
    fixture.detectChanges();

    httpMock
      .expectOne('/api/v1/integration/health')
      .flush({ error: 'Timeout' }, { status: 504, statusText: 'Gateway Timeout' });
    fixture.detectChanges();
    expect(fixture.componentInstance['pageState']()).toBe('error');

    fixture.componentInstance['load']();
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/integration/health').flush(MOCK_HEALTH);
    fixture.detectChanges();
    expect(fixture.componentInstance['pageState']()).toBe('loaded');
  });

  it('should map healthy connector to "success" severity', () => {
    const component = createAndFlush([]);
    const healthy: IntegrationHealthDto = {
      connector: 'A',
      isHealthy: true,
      status: 'Healthy',
      checkedAtUtc: '2026-01-01T00:00:00Z',
    };
    expect(component['getSeverity'](healthy)).toBe('success');
  });

  it('should map unhealthy connector to "danger" severity', () => {
    const component = createAndFlush([]);
    const unhealthy: IntegrationHealthDto = {
      connector: 'B',
      isHealthy: false,
      status: 'Unhealthy',
      checkedAtUtc: '2026-01-01T00:00:00Z',
    };
    expect(component['getSeverity'](unhealthy)).toBe('danger');
  });

  it('should map degraded connector to "warn" severity', () => {
    const component = createAndFlush([]);
    const degraded: IntegrationHealthDto = {
      connector: 'C',
      isHealthy: false,
      status: 'Degraded',
      checkedAtUtc: '2026-01-01T00:00:00Z',
    };
    expect(component['getSeverity'](degraded)).toBe('warn');
  });
});
