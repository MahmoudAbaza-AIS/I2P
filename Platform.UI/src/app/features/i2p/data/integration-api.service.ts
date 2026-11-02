import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import { RUNTIME_CONFIG } from '../../../core/config/runtime-config.loader';
import { parseApiError } from '../../../core/http/api-error';
import {
  ExchangeHistoryItemDto,
  ExchangesQuery,
  IntegrationHealthDto,
  PagedResultDto,
} from './integration.models';

/**
 * IntegrationApiService
 *
 * Hand-written HTTP facade for the Integration (I2P) backend slice.
 * Uses HttpClient directly against the routes documented in the backend contract.
 *
 * ── Migration path ─────────────────────────────────────────────────────────
 * Once `npm run api:generate` produces src/app/generated/api:
 *  1. Replace the HttpClient calls below with the generated service methods.
 *  2. Keep the method signatures and return types identical so consumers
 *     need zero changes.
 *  3. Remove this comment block.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * Required role: Integration.Reader (or Operator / Admin)
 */
@Injectable({ providedIn: 'root' })
export class IntegrationApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RUNTIME_CONFIG);

  private get baseUrl(): string {
    return this.config.apiBaseUrl;
  }

  /**
   * GET /api/v1/integration/health
   *
   * Returns the health status of all registered integration connectors.
   */
  getHealth(): Observable<IntegrationHealthDto[]> {
    return this.http
      .get<IntegrationHealthDto[]>(`${this.baseUrl}/integration/health`)
      .pipe(catchError(this.handleError));
  }

  /**
   * GET /api/v1/integration/sync/exchanges?page={page}&pageSize={pageSize}
   *
   * Returns a paginated list of exchange history records.
   */
  getExchanges(query: ExchangesQuery): Observable<PagedResultDto<ExchangeHistoryItemDto>> {
    const params = new HttpParams()
      .set('page', String(query.page))
      .set('pageSize', String(query.pageSize));

    return this.http
      .get<PagedResultDto<ExchangeHistoryItemDto>>(
        `${this.baseUrl}/integration/sync/exchanges`,
        { params }
      )
      .pipe(catchError(this.handleError));
  }

  private handleError(err: unknown): Observable<never> {
    if (err instanceof HttpErrorResponse) {
      const correlationId =
        err.headers.get('X-Correlation-ID') ?? undefined;
      return throwError(() => parseApiError(err.status, err.error, correlationId));
    }
    return throwError(() => err);
  }
}
