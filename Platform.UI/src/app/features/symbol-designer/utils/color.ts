const NAMED: Readonly<Record<string, string>> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  lime: '#00ff00',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  aqua: '#00ffff',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  gray: '#808080',
  grey: '#808080',
  silver: '#c0c0c0',
  maroon: '#800000',
  olive: '#808000',
  navy: '#000080',
  purple: '#800080',
  teal: '#008080',
  orange: '#ffa500',
};

function hex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

/**
 * Normalize an SVG paint value to `#rrggbb` for a colour input.
 * Ported from the POC `colorValue`, extended with 3/4/8-digit hex, rgba() and named colours.
 * Returns `fallback` for `none`, `url(...)`, `currentColor` and anything unparseable.
 */
export function toHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const v = value.trim().toLowerCase();
  if (v === 'none' || v.startsWith('url(') || v === 'currentcolor' || v === 'transparent') {
    return fallback;
  }
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  if (/^#[0-9a-f]{8}$/.test(v)) return v.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/.test(v)) {
    return '#' + [v[1], v[2], v[3]].map((c) => c + c).join('');
  }
  const rgb = v.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/);
  if (rgb)
    return (
      '#' +
      rgb
        .slice(1, 4)
        .map((p) => hex2(Number(p)))
        .join('')
    );
  return NAMED[v] ?? fallback;
}

/** True when the paint value is something a colour input can represent. */
export function isEditableColor(value: string | null | undefined): boolean {
  return toHexColor(value, '') !== '';
}
