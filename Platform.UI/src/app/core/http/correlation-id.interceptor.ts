import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Attaches a unique X-Correlation-ID header to every outgoing HTTP request.
 * The backend echoes this header in responses for distributed tracing.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  const correlationId = generateCorrelationId();
  const cloned = req.clone({
    headers: req.headers.set('X-Correlation-ID', correlationId),
  });
  return next(cloned);
};

/**
 * Generates a UUID v4-like string without external dependencies.
 * Uses crypto.randomUUID() when available (modern browsers/Node 15+).
 */
function generateCorrelationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
