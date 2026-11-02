import {
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { IntegrationApiService } from '../../data/integration-api.service';
import {
  ExchangeHistoryItemDto,
  PagedResultDto,
} from '../../data/integration.models';
import { ApiError } from '../../../../core/http/api-error';
import { DisplayTimePipe } from '../../../../core/time/display-time.pipe';
import { LoadingStateComponent } from '../../../../shared/state/loading-state.component';
import { EmptyStateComponent } from '../../../../shared/state/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/state/error-state.component';
import { UnauthorizedStateComponent } from '../../../../shared/state/unauthorized-state.component';

type PageState = 'loading' | 'loaded' | 'empty' | 'error' | 'unauthorized';

const DEFAULT_PAGE_SIZE = 20;

@Component({
  selector: 'app-exchanges-page',
  standalone: true,
  imports: [
    TranslocoModule,
    TableModule,
    PaginatorModule,
    DisplayTimePipe,
    LoadingStateComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    UnauthorizedStateComponent,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">{{ 'i2p.exchanges.title' | transloco }}</h1>
      <p class="page-subtitle">{{ 'i2p.exchanges.subtitle' | transloco }}</p>
    </div>

    @switch (pageState()) {
      @case ('loading') {
        <app-loading-state [label]="'i2p.exchanges.loading' | transloco" />
      }
      @case ('error') {
        <app-error-state
          [heading]="'common.error.heading' | transloco"
          [message]="errorMessage()"
          (retry)="loadPage(currentPage(), currentPageSize())"
        />
      }
      @case ('unauthorized') {
        <app-unauthorized-state />
      }
      @case ('empty') {
        <app-empty-state
          [heading]="'i2p.exchanges.empty.heading' | transloco"
          [message]="'i2p.exchanges.empty.message' | transloco"
        />
      }
      @case ('loaded') {
        <p-table
          [value]="items()"
          [tableStyle]="{ 'min-width': '60rem' }"
          styleClass="p-datatable-striped p-datatable-sm"
          [rowHover]="true"
          role="grid"
          [attr.aria-label]="'i2p.exchanges.tableAriaLabel' | transloco"
        >
          <ng-template pTemplate="header">
            <tr>
              <th scope="col">{{ 'i2p.exchanges.col.externalId' | transloco }}</th>
              <th scope="col">{{ 'i2p.exchanges.col.sourceSystem' | transloco }}</th>
              <th scope="col">{{ 'i2p.exchanges.col.quality' | transloco }}</th>
              <th scope="col">{{ 'i2p.exchanges.col.sourceTimestamp' | transloco }}</th>
              <th scope="col">{{ 'i2p.exchanges.col.receivedAt' | transloco }}</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>
                <code class="exchange-id" [title]="row.id">{{ row.externalId }}</code>
              </td>
              <td>{{ row.sourceSystem }}</td>
              <td>
                <span [class]="'quality-badge quality-' + row.quality.toLowerCase()">
                  {{ row.quality }}
                </span>
              </td>
              <td>{{ row.sourceTimestampUtc | displayTime }}</td>
              <td>{{ row.receivedAtUtc | displayTime }}</td>
            </tr>
          </ng-template>
        </p-table>

        <p-paginator
          [rows]="currentPageSize()"
          [totalRecords]="totalCount()"
          [first]="(currentPage() - 1) * currentPageSize()"
          [rowsPerPageOptions]="[10, 20, 50, 100]"
          (onPageChange)="onPageChange($event)"
          [attr.aria-label]="'i2p.exchanges.paginatorAriaLabel' | transloco"
        />
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

    .exchange-id {
      font-size: 0.8125rem;
      background: var(--surface-hover);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
    }

    .quality-badge {
      display: inline-block;
      padding: 0.1875rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;

      &.quality-good {
        background: color-mix(in srgb, var(--color-success) 15%, transparent);
        color: var(--color-success);
      }

      &.quality-bad {
        background: color-mix(in srgb, var(--color-danger) 15%, transparent);
        color: var(--color-danger);
      }

      &.quality-uncertain {
        background: color-mix(in srgb, var(--color-warning) 15%, transparent);
        color: var(--color-warning);
      }
    }
  `],
})
export class ExchangesPageComponent implements OnInit {
  private readonly api = inject(IntegrationApiService);

  protected readonly items = signal<ExchangeHistoryItemDto[]>([]);
  protected readonly totalCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly currentPageSize = signal(DEFAULT_PAGE_SIZE);
  protected readonly pageState = signal<PageState>('loading');
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    this.loadPage(1, DEFAULT_PAGE_SIZE);
  }

  protected loadPage(page: number, pageSize: number): void {
    this.pageState.set('loading');
    this.currentPage.set(page);
    this.currentPageSize.set(pageSize);

    this.api.getExchanges({ page, pageSize }).subscribe({
      next: (result: PagedResultDto<ExchangeHistoryItemDto>) => {
        this.items.set(result.items);
        this.totalCount.set(result.totalCount);
        this.pageState.set(result.items.length === 0 ? 'empty' : 'loaded');
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

  protected onPageChange(event: PaginatorState): void {
    const page = (event.page ?? 0) + 1; // PrimeNG paginator is 0-indexed
    const pageSize = event.rows ?? DEFAULT_PAGE_SIZE;
    this.loadPage(page, pageSize);
  }
}
