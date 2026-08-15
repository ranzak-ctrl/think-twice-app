import { describe, it, expect } from 'vitest';
import { rewriteTurn } from '../../src/ui/rewriteTurn.js';

const transcript = () => [
  { role: 'assistant', content: 'אז ספר לי — מה קרה?', at: 1 },
  { role: 'user', content: 'קניתי בשר לא איכותי.', at: 2 },
  { role: 'assistant', content: 'ומה הרגשת אז?', at: 3 },
  { role: 'user', content: 'מטומטם.', at: 4 },
];

describe('rewriteTurn', () => {
  it('replaces the question and ends the transcript there', () => {
    const out = rewriteTurn(transcript(), 2, 'מה עבר לך בראש באותו רגע?');
    expect(out).toHaveLength(3);
    expect(out[2].content).toBe('מה עבר לך בראש באותו רגע?');
  });

  it('keeps the turns before it untouched', () => {
    const before = transcript();
    const out = rewriteTurn(before, 2, 'שאלה אחרת');
    expect(out.slice(0, 2)).toEqual(before.slice(0, 2));
  });

  it('does not mutate the transcript it was given', () => {
    const before = transcript();
    rewriteTurn(before, 2, 'שאלה אחרת');
    expect(before).toHaveLength(4);
    expect(before[2].content).toBe('ומה הרגשת אז?');
  });

  it("records the model's original wording", () => {
    const out = rewriteTurn(transcript(), 2, 'שאלה אחרת', 'יותר מדי כללי');
    expect(out[2].feedback.original).toBe('ומה הרגשת אז?');
    expect(out[2].feedback.rewrite).toBe('שאלה אחרת');
    expect(out[2].feedback.text).toBe('יותר מדי כללי');
  });

  it('keeps the first original through a second rewrite', () => {
    const once = rewriteTurn(transcript(), 2, 'ניסוח ראשון');
    const twice = rewriteTurn(once, 2, 'ניסוח שני');
    expect(twice[2].feedback.original).toBe('ומה הרגשת אז?');
    expect(twice[2].content).toBe('ניסוח שני');
  });

  it('omits the note field when no note was written', () => {
    const out = rewriteTurn(transcript(), 2, 'שאלה אחרת');
    expect(out[2].feedback).not.toHaveProperty('text');
  });

  it('rewriting the last turn discards nothing', () => {
    const out = rewriteTurn(transcript(), 3, 'טקסט');
    expect(out).toHaveLength(4);
  });

  it('returns the transcript unchanged for an index that is not there', () => {
    const before = transcript();
    expect(rewriteTurn(before, 99, 'שאלה')).toBe(before);
  });
});
