import { APP_INITIALIZER, EnvironmentProviders, inject, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_RUNTIME_CONFIG, RuntimeConfig } from './runtime-config';

/** InjectionToken that holds the loaded RuntimeConfig. */
export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_RUNTIME_CONFIG,
});

/**
 * Holds the mutable reference used by the initializer.
 * Components/services must inject RUNTIME_CONFIG for immutability.
 */
const runtimeConfigStore = { value: DEFAULT_RUNTIME_CONFIG };

/** Access the current config value (populated after APP_INITIALIZER). */
export function getRuntimeConfig(): RuntimeConfig {
  return runtimeConfigStore.value;
}

function loadRuntimeConfig(http: HttpClient): () => Promise<void> {
  return async () => {
    try {
      const config = await firstValueFrom(
        http.get<RuntimeConfig>('/config.json')
      );
      runtimeConfigStore.value = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    } catch (err) {
      console.warn(
        '[RuntimeConfig] Could not load /config.json — using defaults.',
        err
      );
    }
  };
}

/**
 * Provides the runtime config initializer and token.
 * Add to app.config.ts providers array.
 */
export function provideRuntimeConfig(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: RUNTIME_CONFIG,
      useFactory: getRuntimeConfig,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const http = inject(HttpClient);
        return loadRuntimeConfig(http);
      },
      multi: true,
      deps: [HttpClient],
    },
  ]);
}
