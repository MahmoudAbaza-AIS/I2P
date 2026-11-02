import { Component, input } from '@angular/core';

/**
 * Displayed when a query succeeds but returns zero results.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  template: `
    <div class="state-container state-empty" role="status">
      <div class="state-icon" aria-hidden="true">📭</div>
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
      color: var(--text-color);
    }

    .state-message {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
    }
  `],
})
export class EmptyStateComponent {
  readonly heading = input('No results');
  readonly message = input('There are no items to display.');
}
