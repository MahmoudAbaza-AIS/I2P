import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { REPRESENTATIVE, readSample } from '../testing/symbol-fixtures';
import {
  MAX_SVG_BYTES,
  SvgImportService,
  isUnsafeUrlValue,
  lengthToPx,
  parseAndSanitizeSvg,
} from './svg-import.service';

const parse = (s: string) => parseAndSanitizeSvg(s, document);
const svg = (body: string, attrs = 'viewBox="0 0 10 10"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attrs}>${body}</svg>`;

function root(s: string): SVGSVGElement {
  const r = parse(s);
  if (!r.ok) throw new Error(r.error);
  return r.root;
}

describe('svg import', () => {
  it('rejects invalid markup and non-svg roots', () => {
    expect(parse('<svg><g></svg>')).toEqual({ ok: false, error: 'invalidSvg' });
    expect(parse('<html xmlns="http://www.w3.org/1999/xhtml"/>')).toEqual({
      ok: false,
      error: 'noSvgRoot',
    });
  });

  it('removes scripts, foreignObject and other active content', () => {
    const r = root(
      svg(
        '<script>alert(1)</script><foreignObject><div/></foreignObject><iframe/><embed/><object/><rect/>',
      ),
    );
    expect(r.querySelectorAll('script, foreignObject, iframe, embed, object').length).toBe(0);
    expect(r.querySelectorAll('rect').length).toBe(1);
  });

  it('removes event handlers and external references, keeps internal ones', () => {
    const r = root(
      svg(
        '<rect onclick="x()" onload="y()" fill="url(#g)"/>' +
          '<rect fill="url(\'#g\')"/>' +
          '<rect fill="url(http://evil/x.svg#a)"/>' +
          '<use href="#a"/><use xlink:href="other.svg#a"/><a href="javascript:alert(1)"><rect/></a>' +
          '<image href="data:image/png;base64,AAAA"/><image href="https://example.com/x.png"/>',
      ),
    );
    const rects = r.querySelectorAll('rect');
    expect(rects[0].hasAttribute('onclick')).toBe(false);
    expect(rects[0].hasAttribute('onload')).toBe(false);
    expect(rects[0].getAttribute('fill')).toBe('url(#g)');
    expect(rects[1].getAttribute('fill')).toBe("url('#g')");
    expect(rects[2].hasAttribute('fill')).toBe(false);
    const uses = r.querySelectorAll('use');
    expect(uses[0].getAttribute('href')).toBe('#a');
    expect(uses[1].attributes.length).toBe(0);
    expect(r.querySelector('a')!.hasAttribute('href')).toBe(false);
    const images = r.querySelectorAll('image');
    expect(images[0].getAttribute('href')).toContain('data:image/png');
    expect(images[1].hasAttribute('href')).toBe(false);
  });

  it('removes unsafe <style> blocks and href-targeting animations', () => {
    const r = root(
      svg(
        '<style>@import url(x.css);</style><style>.a{fill:url(#g)}</style>' +
          '<a><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="opacity"/></a>',
      ),
    );
    expect(r.querySelectorAll('style').length).toBe(1);
    expect(r.querySelector('set')).toBeNull();
    expect(r.querySelector('animate')).not.toBeNull();
  });

  it('derives a missing viewBox from width/height including units', () => {
    expect(root(svg('', 'width="40" height="20"')).getAttribute('viewBox')).toBe('0 0 40 20');
    expect(root(svg('', 'width="1in" height="72pt"')).getAttribute('viewBox')).toBe('0 0 96 96');
    expect(root(svg('', 'width="100%"')).getAttribute('viewBox')).toBe('0 0 300 200');
    expect(lengthToPx('25.4mm')).toBeCloseTo(96);
    expect(lengthToPx('abc')).toBe(0);
  });

  it('classifies url() values', () => {
    expect(isUnsafeUrlValue('url(#a)')).toBe(false);
    expect(isUnsafeUrlValue('fill: url( "#a" ); stroke: url(#b)')).toBe(false);
    expect(isUnsafeUrlValue('url(#a) url(x.svg)')).toBe(true);
    expect(isUnsafeUrlValue('none')).toBe(false);
  });

  it('validates file name and size', () => {
    const service = TestBed.inject(SvgImportService);
    expect(service.validateFile({ name: 'a.png', size: 1 })).toBe('notSvgFile');
    expect(service.validateFile({ name: 'a.SVG', size: MAX_SVG_BYTES + 1 })).toBe('tooLarge');
    expect(service.validateFile({ name: 'a.svg', size: 10 })).toBeNull();
  });

  it.each(REPRESENTATIVE)('imports representative sample %s without losing artwork', (file) => {
    const source = readSample(file);
    const r = root(source);
    const original = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
    expect(r.querySelectorAll('*').length).toBe(original.querySelectorAll('*').length);
  });
});
