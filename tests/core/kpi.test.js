import { describe, it, expect } from 'vitest';
import { countSelfOther, formatSelfOther } from '../../src/core/kpi.js';

describe('countSelfOther — self/other pronoun ratio', () => {
  it('counts first-person markers', () => {
    expect(countSelfOther('אני הלכתי הביתה')).toEqual({ self: 1, other: 0 });
  });

  it('counts third-person markers', () => {
    expect(countSelfOther('הוא אמר לי שזה שלו')).toEqual({ self: 1, other: 2 });
  });

  it('handles attached proclitic prefixes (ו/ש/ה...)', () => {
    // "ושלי" → שלי (self), "שלו" → other
    expect(countSelfOther('ושלי וגם שלו')).toEqual({ self: 1, other: 1 });
    // "שהוא" → הוא (other)
    expect(countSelfOther('ידעתי שהוא צודק')).toEqual({ self: 0, other: 1 });
  });

  it('does not miscount ordinary words whose suffix looks like a short pronoun', () => {
    // "כלה" must not be peeled to "לה"
    expect(countSelfOther('כלה יפה')).toEqual({ self: 0, other: 0 });
  });

  it('returns zeros for empty or nullish input', () => {
    expect(countSelfOther('')).toEqual({ self: 0, other: 0 });
    expect(countSelfOther(null)).toEqual({ self: 0, other: 0 });
    expect(countSelfOther(undefined)).toEqual({ self: 0, other: 0 });
  });
});

describe('formatSelfOther', () => {
  it('renders the ratio with a self percentage', () => {
    expect(formatSelfOther(3, 1)).toBe('3:1 (75% אני)');
  });

  it('renders an em-dash when there are no references yet', () => {
    expect(formatSelfOther(0, 0)).toBe('—');
  });
});
