import { describe, it, expect } from 'vitest';
import { buildInlineStyle, sizeFromViewBox, PAINT_PROPERTIES } from '../../src/ui/mapExport.js';

// A stand-in for CSSStyleDeclaration: the browser answers every property, with
// '' for the ones that do not apply, and that empty answer is the interesting
// case — writing it out would override the real value with nothing.
const computed = (values) => ({ getPropertyValue: (p) => values[p] ?? '' });

describe('inline paint', () => {
  it('carries the properties the stylesheet actually sets', () => {
    const style = buildInlineStyle(computed({ fill: 'none', stroke: '#333', 'stroke-width': '1.5px' }));
    expect(style).toBe('fill: none; stroke: #333; stroke-width: 1.5px');
  });

  it('drops properties the browser has no value for', () => {
    expect(buildInlineStyle(computed({ stroke: '#333' }))).toBe('stroke: #333');
  });

  it('is empty when nothing applies, so no style attribute is written', () => {
    expect(buildInlineStyle(computed({}))).toBe('');
  });

  // The map is a sketch: dashes distinguish a slot at 1 (provisional) from one
  // at 2 (confirmed), per the ruling of 5.9.2026 that certainty is a weight and
  // not a gate. A PNG that loses the dashes states more certainty than the
  // interview has.
  it('carries the properties that make the sketch mean what it means', () => {
    for (const prop of ['stroke-dasharray', 'opacity', 'font-family', 'font-size']) {
      expect(PAINT_PROPERTIES).toContain(prop);
    }
  });
});

describe('picture size', () => {
  it('comes from the viewBox', () => {
    expect(sizeFromViewBox('0 0 900 620')).toEqual({ width: 900, height: 620 });
  });

  it('tolerates comma separators and extra whitespace', () => {
    expect(sizeFromViewBox('  0, 0, 900, 620 ')).toEqual({ width: 900, height: 620 });
  });

  // A bad viewBox must cost the drawing its proportions, never its existence.
  it('falls back rather than producing a zero-sized canvas', () => {
    for (const bad of [null, undefined, '', 'nonsense', '0 0 0 0', '0 0 900']) {
      const { width, height } = sizeFromViewBox(bad);
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);
    }
  });
});
