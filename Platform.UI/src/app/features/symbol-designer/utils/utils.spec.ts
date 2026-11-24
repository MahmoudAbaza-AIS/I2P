import { describe, expect, it } from 'vitest';
import { toHexColor } from './color';
import { displayNameFromFile, safeFileName } from './file';
import { inlineStyleValue, readViewBox, removeInlineStyleProps } from './svg-dom';
import { applyToPoint, composeTransform, parseTransform } from './transform';
import { DEFAULT_VIEWPORT, MAX_ZOOM, zoomAt } from './viewport';
import { IDENTITY_EDIT_TRANSFORM } from '../models/symbol-part.model';

describe('color utils', () => {
  it.each([
    ['#ABCDEF', '#abcdef'],
    ['#abc', '#aabbcc'],
    ['#11223344', '#112233'],
    ['rgb(255, 0, 16)', '#ff0010'],
    ['rgba(1,2,3,0.5)', '#010203'],
    ['white', '#ffffff'],
    ['none', 'fb'],
    ['url(#g)', 'fb'],
    ['currentColor', 'fb'],
    [null, 'fb'],
  ])('%s → %s', (input, expected) => {
    expect(toHexColor(input, 'fb')).toBe(expected);
  });
});

describe('transform utils', () => {
  it('parses transform lists', () => {
    const m = parseTransform('translate(10 20) scale(2)');
    expect(applyToPoint(m, 1, 1)).toEqual({ x: 12, y: 22 });
    const r = parseTransform('rotate(90 5 5)');
    const p = applyToPoint(r, 10, 5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(10);
    expect(parseTransform('matrix(1 0 0 1 3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
    expect(parseTransform('bogus(1)')).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('composes edit transforms in front of the base', () => {
    expect(composeTransform(IDENTITY_EDIT_TRANSFORM, null, null)).toBeNull();
    expect(composeTransform(IDENTITY_EDIT_TRANSFORM, 'scale(2)', null)).toBe('scale(2)');
    expect(
      composeTransform({ ...IDENTITY_EDIT_TRANSFORM, translateX: 1, scaleX: 2 }, null, {
        x: 3,
        y: 4,
      }),
    ).toBe('translate(1 0) translate(3 4) scale(2 1) translate(-3 -4)');
  });
});

describe('svg-dom utils', () => {
  it('reads viewBox with fallback', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0,0 10 20');
    expect(readViewBox(el)).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    el.setAttribute('viewBox', 'x');
    expect(readViewBox(el).width).toBe(300);
  });

  it('reads and removes inline style properties', () => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    el.setAttribute('style', 'FILL: red; stroke:blue');
    expect(inlineStyleValue(el, 'fill')).toBe('red');
    expect(removeInlineStyleProps('fill: red; stroke:blue', ['fill'])).toBe('stroke:blue');
    expect(removeInlineStyleProps('fill: red;', ['fill'])).toBeNull();
  });
});

describe('viewport utils', () => {
  it('zooms around a fixed point and clamps', () => {
    const v = zoomAt(DEFAULT_VIEWPORT, 2, 100, 50);
    expect(v).toEqual({ zoom: 2, x: -100, y: -50 });
    // The content point under (100, 50) stays put: (100 - x) / zoom = 100.
    expect((100 - v.x) / v.zoom).toBe(100);
    expect(zoomAt(v, 1000, 0, 0).zoom).toBe(MAX_ZOOM);
  });
});

describe('file utils', () => {
  it('builds safe and display names', () => {
    expect(safeFileName('  Pump 01: <A>  ')).toBe('Pump-01-A-');
    expect(safeFileName('')).toBe('symbol');
    expect(displayNameFromFile('tile-bed_shadow.svg')).toBe('Tile bed shadow');
  });
});
