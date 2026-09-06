import { describe, it, expect } from 'vitest';
import { rewriteTurn, buildRevision, mergeNote } from '../../src/ui/rewriteTurn.js';

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

describe('buildRevision', () => {
  it('keeps the turns the rewrite is about to discard', () => {
    const rev = buildRevision(transcript(), 0, 'שאלה חדשה', 'למה', 1);
    expect(rev.discarded).toHaveLength(3);
    expect(rev.discarded[0].content).toBe('קניתי בשר לא איכותי.');
  });

  it('records what was asked, what replaced it, and why', () => {
    const rev = buildRevision(transcript(), 2, 'שאלה חדשה', 'כללי מדי', 3);
    expect(rev.original).toBe('ומה הרגשת אז?');
    expect(rev.replaced).toBe('ומה הרגשת אז?');
    expect(rev.rewrite).toBe('שאלה חדשה');
    expect(rev.note).toBe('כללי מדי');
    expect(rev.stage).toBe(3);
    expect(rev.index).toBe(2);
  });

  it('distinguishes the original from what a second rewrite replaced', () => {
    const once = rewriteTurn(transcript(), 2, 'ניסוח ראשון', 'הערה');
    const rev = buildRevision(once, 2, 'ניסוח שני', 'עוד הערה', 3);
    expect(rev.original).toBe('ומה הרגשת אז?');
    expect(rev.replaced).toBe('ניסוח ראשון');
  });

  it('discards nothing when the last turn is rewritten', () => {
    expect(buildRevision(transcript(), 3, 'טקסט', 'הערה', 1).discarded).toEqual([]);
  });

  it('returns null for an index that is not there', () => {
    expect(buildRevision(transcript(), 99, 'שאלה', 'הערה', 1)).toBeNull();
  });

  it('survives the truncation it describes', () => {
    const before = transcript();
    const rev = buildRevision(before, 1, 'שאלה', 'הערה', 1);
    rewriteTurn(before, 1, 'שאלה', 'הערה');
    expect(rev.discarded).toHaveLength(2);
  });
});

describe('a note without a rewrite', () => {
  // Ran, 6.9.2026: give feedback on what was wrong and move on, without writing
  // the question you would have asked instead. The editor used to demand both
  // fields, so recording "this question was off" also rewrote the turn — which
  // discards every answer that followed it.
  it('files the note and touches nothing else', () => {
    const fb = mergeNote(undefined, 'השאלה הייתה סגורה מדי');
    expect(fb.text).toBe('השאלה הייתה סגורה מדי');
    expect(fb.rewrite).toBeUndefined();
    expect(fb.original).toBeUndefined();
    expect(typeof fb.at).toBe('number');
  });

  it('keeps the interviewer’s own wording from an earlier rewrite', () => {
    // The rewrite path guards this for itself; a note arriving afterwards has to
    // guard it too, or the export stops showing what the model actually asked.
    const after = rewriteTurn(
      [{ role: 'assistant', content: 'מה הרגשת?' }],
      0,
      'מה עבר לך בראש?',
      'לא רגש — מחשבה',
    );
    const fb = mergeNote(after[0].feedback, 'בעצם זו שאלה טובה');
    expect(fb.original).toBe('מה הרגשת?');
    expect(fb.rewrite).toBe('מה עבר לך בראש?');
    expect(fb.text).toBe('בעצם זו שאלה טובה');
  });

  it('does not mutate the feedback it was given', () => {
    const existing = { text: 'ישן', original: 'מה הרגשת?' };
    mergeNote(existing, 'חדש');
    expect(existing.text).toBe('ישן');
  });
});
