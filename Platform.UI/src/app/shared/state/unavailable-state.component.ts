import { Component, input } from '@angular/core';

/**
 * Displayed when a feature or service is unavailable (e.g. backend down,
 * feature flag disabled, real-time hub not connected).
 */
@Component({
  selector: 'app-unavailable-state',
  standalone: true,
  template: `
    <div class="state-container state-unavailable" role="status">
      <div class="state-icon" aria-hidden="true">🔌</div>
      <h3 class="state-heading">{{ heading() }}</h3>
      <p class="state-message">{{ message() }}</p>
    </div>
  `,
  styles: [`
    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 3rem 1rem;
      text-align: center;
    }

    .state-icon {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }

    .state-heading {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--color-warning, #f59e0b);
    }

    .state-message {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
      max-width: 40ch;
    }
  `],
})
export class UnavailableStateComponent {
  readonly heading = input('Service unavailable');
  readonly message = input('This feature is currently unavailable. Please check back later.');
}
