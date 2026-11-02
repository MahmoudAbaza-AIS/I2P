import { Component, input } from '@angular/core';

/**
 * Displayed when the user lacks permission to view a resource (HTTP 401/403).
 */
@Component({
  selector: 'app-unauthorized-state',
  standalone: true,
  template: `
    <div class="state-container state-unauthorized" role="alert">
      <div class="state-icon" aria-hidden="true">🔒</div>
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
      color: var(--color-danger, #ef4444);
    }

    .state-message {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
      max-width: 40ch;
    }
  `],
})
export class UnauthorizedStateComponent {
  readonly heading = input('Access denied');
  readonly message = input(
    'You do not have permission to view this page. Contact your administrator if you believe this is an error.'
  );
}
