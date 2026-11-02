import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { IntegrationApiService } from '../../data/integration-api.service';
import { IntegrationHealthDto } from '../../data/integration.models';
import { ApiError } from '../../../../core/http/api-error';
import { DisplayTimePipe } from '../../../../core/time/display-time.pipe';
import { LoadingStateComponent } from '../../../../shared/state/loading-state.component';
import { EmptyStateComponent } from '../../../../shared/state/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/state/error-state.component';
import { UnauthorizedStateComponent } from '../../../../shared/state/unauthorized-state.component';

type PageState = 'loading' | 'loaded' | 'empty' | 'error' | 'unauthorized';

@Component({
  selector: 'app-health-page',
  standalone: true,
  imports: [
    TranslocoModule,
    TagModule,
    TableModule,
    DisplayTimePipe,
    LoadingStateComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    UnauthorizedStateComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">{{ 'i2p.health.title' | transloco }}</h1>
      <p class="page-subtitle">{{ 'i2p.health.subtitle' | transloco }}</p>
    </div>

    @switch (pageState()) {
      @case ('loading') {
        <app-loading-state [label]="'i2p.health.loading' | transloco" />
      }
      @case ('error') {
        <app-error-state
          [heading]="'common.error.heading' | transloco"
          [message]="errorMessage()"
          (retry)="load()"
        />
      }
      @case ('unauthorized') {
        <app-unauthorized-state />
      }
      @case ('empty') {
        <app-empty-state
          [heading]="'i2p.health.empty.heading' | transloco"
          [message]="'i2p.health.empty.message' | transloco"
        />
      }
      @case ('loaded') {
        <p-table
          [value]="connectors()"
          [tableStyle]="{ 'min-width': '50rem' }"
          styleClass="p-datatable-striped p-datatable-sm"
          [rowHover]="true"
          role="grid"
          [attr.aria-label]="'i2p.health.tableAriaLabel' | transloco"
        >
          <ng-template pTemplate="header">
            <tr>
              <th scope="col">{{ 'i2p.health.col.connector' | transloco }}</th>
              <th scope="col">{{ 'i2p.health.col.status' | transloco }}</th>
              <th scope="col">{{ 'i2p.health.col.checkedAt' | transloco }}</th>
              <th scope="col">{{ 'i2p.health.col.detail' | transloco }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>{{ row.connector }}</td>
              <td>
                <p-tag
                  [value]="row.status"
                  [severity]="getSeverity(row)"
                  [rounded]="true"
                />
              </td>
              <td>{{ row.checkedAtUtc | displayTime }}</td>
              <td>{{ row.detail ?? '—' }}</td>
            </tr>
          </ng-template>
        </p-table>
      }
    }
  `,
  styles: [`
    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-title {
      margin: 0 0 0.25rem;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--text-color);
    }

    .page-subtitle {
      margin: 0;
      color: var(--text-color-secondary);
      font-size: 0.9375rem;
    }
  `],
})
export class HealthPageComponent implements OnInit {
  private readonly api = inject(IntegrationApiService);

  protected readonly connectors = signal<IntegrationHealthDto[]>([]);
  protected readonly pageState = signal<PageState>('loading');
  protected readonly errorMessage = signal<string>('');

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.pageState.set('loading');
    this.api.getHealth().subscribe({
      next: (data) => {
        this.connectors.set(data);
        this.pageState.set(data.length === 0 ? 'empty' : 'loaded');
      },
      error: (err: unknown) => {
        if (err instanceof ApiError && (err.isUnauthorized || err.isForbidden)) {
          this.pageState.set('unauthorized');
        } else {
          this.errorMessage.set(
            err instanceof ApiError ? err.message : 'An unexpected error occurred.'
          );
          this.pageState.set('error');
        }
      },
    });
  }

  protected getSeverity(row: IntegrationHealthDto): 'success' | 'danger' | 'warn' | 'info' {
    if (row.isHealthy) return 'success';
    const s = row.status.toLowerCase();
    if (s.includes('degraded')) return 'warn';
    return 'danger';
  }
}
