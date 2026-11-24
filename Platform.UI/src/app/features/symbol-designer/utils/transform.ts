import { EditTransform } from '../models/symbol-part.model';
import { round } from './svg-dom';

/** 2D affine matrix [a, b, c, d, e, f] as in SVG `matrix(a b c d e f)`. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export function multiply(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function applyToPoint(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

const translate = (tx: number, ty: number): Matrix => [1, 0, 0, 1, tx, ty];
const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
function rotate(deg: number): Matrix {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [cos, sin, -sin, cos, 0, 0];
}

/**
 * Parse an SVG `transform` attribute into a matrix. Unknown functions are ignored.
 */
export function parseTransform(value: string | null | undefined): Matrix {
  if (!value) return IDENTITY;
  let result: Matrix = IDENTITY;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    const args = match[2]
      .trim()
      .split(/[\s,]+/)
      .filter((a) => a.length > 0)
      .map(Number);
    if (args.some((a) => !Number.isFinite(a))) continue;
    let m: Matrix = IDENTITY;
    switch (match[1]) {
      case 'matrix':
        if (args.length === 6) m = [args[0], args[1], args[2], args[3], args[4], args[5]];
        break;
      case 'translate':
        m = translate(args[0] ?? 0, args[1] ?? 0);
        break;
      case 'scale':
        m = scale(args[0] ?? 1, args[1] ?? args[0] ?? 1);
        break;
      case 'rotate': {
        const [deg = 0, cx = 0, cy = 0] = args;
        m = multiply(multiply(translate(cx, cy), rotate(deg)), translate(-cx, -cy));
        break;
      }
      case 'skewX':
        m = [1, 0, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        m = [1, Math.tan(((args[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    result = multiply(result, m);
  }
  return result;
}

export function isIdentityEdit(t: EditTransform): boolean {
  return (
    t.translateX === 0 && t.translateY === 0 && t.rotation === 0 && t.scaleX === 1 && t.scaleY === 1
  );
}

/**
 * Compose the editor transform in front of the element's original transform.
 * Rotation and scale pivot on `pivot` (the part's centre in parent space);
 * the POC pivoted on the origin, which made rotated parts jump away.
 * Returns null when nothing remains (no edit, no original transform).
 */
export function composeTransform(
  edit: EditTransform,
  base: string | null,
  pivot: { x: number; y: number } | null,
): string | null {
  const parts: string[] = [];
  const f = (n: number) => String(round(n, 3));
  if (edit.translateX !== 0 || edit.translateY !== 0) {
    parts.push(`translate(${f(edit.translateX)} ${f(edit.translateY)})`);
  }
  const hasRotate = edit.rotation !== 0;
  const hasScale = edit.scaleX !== 1 || edit.scaleY !== 1;
  if (hasRotate || hasScale) {
    const cx = pivot?.x ?? 0;
    const cy = pivot?.y ?? 0;
    const pivoted = cx !== 0 || cy !== 0;
    if (pivoted) parts.push(`translate(${f(cx)} ${f(cy)})`);
    if (hasRotate) parts.push(`rotate(${f(edit.rotation)})`);
    if (hasScale) parts.push(`scale(${f(edit.scaleX)} ${f(edit.scaleY)})`);
    if (pivoted) parts.push(`translate(${f(-cx)} ${f(-cy)})`);
  }
  if (base && base.trim()) parts.push(base.trim());
  return parts.length ? parts.join(' ') : null;
}

export function normalizeEdit(t: Partial<EditTransform>, current: EditTransform): EditTransform {
  const pick = (v: number | undefined, fallback: number) =>
    v !== undefined && Number.isFinite(v) ? v : fallback;
  return {
    translateX: pick(t.translateX, current.translateX),
    translateY: pick(t.translateY, current.translateY),
    rotation: pick(t.rotation, current.rotation),
    // POC clamps scale to [0.05, 20].
    scaleX: Math.min(20, Math.max(0.05, pick(t.scaleX, current.scaleX))),
    scaleY: Math.min(20, Math.max(0.05, pick(t.scaleY, current.scaleY))),
  };
}
