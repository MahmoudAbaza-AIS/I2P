import { Component } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Shown when /config.json has no OIDC authority configured.
 * This is not an error — it is the expected state for a fresh deployment
 * that has not yet been configured.
 */
@Component({
  selector: 'app-config-required',
  standalone: true,
  imports: [TranslocoModule],
  template: `
    <main class="config-required-page" role="main">
      <div class="config-required-card">
        <div class="config-icon" aria-hidden="true">⚙️</div>
        <h1 class="config-heading">{{ 'auth.configRequired.heading' | transloco }}</h1>
        <p class="config-message">{{ 'auth.configRequired.message' | transloco }}</p>
        <a href="/docs/deployment.md" class="config-docs-link" target="_blank" rel="noopener">
          {{ 'auth.configRequired.docsLink' | transloco }}
        </a>
      </div>
    </main>
  `,
  styles: [`
    .config-required-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100dvh;
      background: var(--surface-ground);
      padding: 1rem;
    }

    .config-required-card {
      max-width: 480px;
      width: 100%;
      background: var(--surface-card);
      border: 1px solid var(--surface-border);
      border-radius: 12px;
      padding: 2.5rem 2rem;
      text-align: center;
    }

    .config-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .config-heading {
      margin: 0 0 1rem;
      font-size: 1.375rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .config-message {
      margin: 0 0 1.5rem;
      color: var(--text-color-secondary);
      line-height: 1.6;
      font-size: 0.9375rem;
    }

    .config-docs-link {
      display: inline-block;
      color: var(--primary-color);
      font-weight: 500;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }
  `],
})
export class ConfigRequiredComponent {}
