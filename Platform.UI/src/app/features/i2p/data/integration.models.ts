/**
 * Typed models matching the verified backend contracts for the
 * Integration (I2P) API slice.
 *
 * These are hand-written to match the DTOs exactly as documented.
 * Once `npm run api:generate` produces code under src/app/generated/api,
 * update IntegrationApiService to use the generated client and
 * keep these types as fallback or remove them.
 *
 * Contracts source: Platform.API — Integration controller v1
 */

/** GET /api/v1/integration/health */
export interface IntegrationHealthDto {
  /** Name of the integration connector. */
  connector: string;
  /** Whether the connector is currently healthy. */
  isHealthy: boolean;
  /** Human-readable status string (e.g. "Healthy", "Degraded", "Unhealthy"). */
  status: string;
  /** UTC timestamp when the health check was last run (ISO-8601 DateTimeOffset). */
  checkedAtUtc: string;
  /** Optional detail message (may be null). */
  detail?: string | null;
}

/** GET /api/v1/integration/sync/exchanges */
export interface ExchangeHistoryItemDto {
  /** Exchange record GUID. */
  id: string;
  /** ID of the endpoint that received the exchange. */
  endpointId: string;
  /** External system's identifier for this exchange. */
  externalId: string;
  /** Name of the source system that sent the data. */
  sourceSystem: string;
  /** Data quality indicator (e.g. "Good", "Bad", "Uncertain"). */
  quality: string;
  /** UTC timestamp from the source system (ISO-8601). */
  sourceTimestampUtc: string;
  /** UTC timestamp when the backend received the exchange (ISO-8601). */
  receivedAtUtc: string;
}

/** Generic paged result wrapper. */
export interface PagedResultDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}

/** Query parameters for the exchanges endpoint. */
export interface ExchangesQuery {
  page: number;
  pageSize: number;
}
