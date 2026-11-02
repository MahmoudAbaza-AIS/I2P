import { Component, input, output } from '@angular/core';

/**
 * Displayed when a data fetch fails.
 * Emits a `retry` event when the user clicks the retry button.
 */
@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <div class="state-container state-error" role="alert">
      <div class="state-icon" aria-hidden="true">⚠️</div>
      <h3 class="state-heading">{{ heading() }}</h3>
      <p class="state-message">{{ message() }}</p>
      @if (showRetry()) {
        <button type="button" class="retry-btn" (click)="retry.emit()">
          Retry
        </button>
      }
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
      color: var(--color-danger, #ef4444);
    }

    .state-message {
      margin: 0 0 1rem;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
      max-width: 40ch;
    }

    .retry-btn {
      padding: 0.5rem 1.25rem;
      background: var(--primary-color);
      color: var(--primary-color-text);
      border: none;
      border-radius: 6px;
      font-size: 0.9375rem;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s;

      &:hover {
        opacity: 0.85;
      }
    }
  `],
})
export class ErrorStateComponent {
  readonly heading = input('Something went wrong');
  readonly message = input('An unexpected error occurred. Please try again.');
  readonly showRetry = input(true);
  readonly retry = output<void>();
}
