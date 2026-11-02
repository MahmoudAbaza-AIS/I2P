/**
 * Typed error models mirroring backend error shapes.
 *
 * The backend returns one of:
 *  1. FluentValidation error:  { error: string, details: ValidationError[] }
 *  2. RFC 7807 ProblemDetails: { type, title, status, detail, instance, ... }
 *  3. Plain string or HTML (gateway errors)
 */

export interface ValidationError {
  propertyName: string;
  errorMessage: string;
}

export interface ApiValidationErrorBody {
  error: string;
  details?: ValidationError[];
}

/** RFC 7807 Problem Details */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export type ApiErrorBody = ApiValidationErrorBody | ProblemDetails;

export class ApiError extends Error {
  readonly statusCode: number;
  readonly body: ApiErrorBody | null;
  readonly correlationId: string | null;

  constructor(statusCode: number, body: ApiErrorBody | null, correlationId: string | null = null) {
    const message = extractMessage(body, statusCode);
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.body = body;
    this.correlationId = correlationId;
  }

  get validationErrors(): ValidationError[] {
    if (isValidationErrorBody(this.body)) {
      return this.body.details ?? [];
    }
    return [];
  }

  get isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  get isForbidden(): boolean {
    return this.statusCode === 403;
  }

  get isNotFound(): boolean {
    return this.statusCode === 404;
  }

  get isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

function isValidationErrorBody(body: ApiErrorBody | null): body is ApiValidationErrorBody {
  return body !== null && typeof (body as ApiValidationErrorBody).error === 'string';
}

function extractMessage(body: ApiErrorBody | null, status: number): string {
  if (!body) return `HTTP error ${status}`;
  if (isValidationErrorBody(body)) return body.error;
  const pd = body as ProblemDetails;
  return pd.detail ?? pd.title ?? `HTTP error ${status}`;
}

/**
 * Parses an HttpErrorResponse body into an ApiError.
 * Safe to call with any value — falls back gracefully.
 */
export function parseApiError(status: number, body: unknown, correlationId?: string): ApiError {
  if (body === null || body === undefined) {
    return new ApiError(status, null, correlationId ?? null);
  }
  if (typeof body === 'object') {
    return new ApiError(status, body as ApiErrorBody, correlationId ?? null);
  }
  return new ApiError(status, { error: String(body) }, correlationId ?? null);
}
