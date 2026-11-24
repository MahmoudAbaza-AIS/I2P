/** Canvas viewport: CSS translate (px) + uniform zoom. Never touches the symbol's viewBox. */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 16;
export const ZOOM_STEP = 1.25;
export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 };

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Zoom by `factor` keeping the canvas point (px, py) fixed on screen.
 * With transform `translate(x,y) scale(z)` and origin 0 0, a content point c
 * shows at x + c*z; keeping it fixed gives x' = p - (p - x) * z'/z.
 */
export function zoomAt(v: Viewport, factor: number, px: number, py: number): Viewport {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

export function pan(v: Viewport, dx: number, dy: number): Viewport {
  return { ...v, x: v.x + dx, y: v.y + dy };
}

export function viewportCss(v: Viewport): string {
  return `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
}
