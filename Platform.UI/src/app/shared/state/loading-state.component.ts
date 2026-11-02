import { Component, input } from '@angular/core';

/**
 * Displays a loading spinner with an optional label.
 * Use while async data is being fetched.
 */
@Component({
  selector: 'app-loading-state',
  standalone: true,
  template: `
    <div class="state-container state-loading" role="status" [attr.aria-label]="label()">
      <div class="spinner" aria-hidden="true"></div>
      <p class="state-message">{{ label() }}</p>
    </div>
  `,
  styles: [`
    .state-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      padding: 3rem 1rem;
      text-align: center;
    }

    .spinner {
      width: 2rem;
      height: 2rem;
      border: 3px solid var(--surface-border);
      border-top-color: var(--primary-color);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .state-message {
      color: var(--text-color-secondary);
      margin: 0;
      font-size: 0.9375rem;
    }
  `],
})
export class LoadingStateComponent {
  readonly label = input('Loading…');
}
