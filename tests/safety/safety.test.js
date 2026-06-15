import { describe, it, expect } from 'vitest';
import { preCheck } from '../../src/safety/index.js';

// Safety layer MUST pass 100% (dev-plan §5.5, CLAUDE.md §7).

describe('Safety — crisis keyword detection (Hebrew)', () => {
  const CRISIS = [
    'אני חושב על פגיעה עצמית',
    'אני רוצה להרוג את עצמי',
    'יש לי מחשבות אובדניות',
    'אני מרגיש שאני רוצה למות',
    'אני לא רוצה לחיות יותר',
    'אני חושב להתאבד',
    'יש סכנת חיים',
  ];

  for (const msg of CRISIS) {
    it(`stops on: "${msg}"`, () => {
      const r = preCheck(msg);
      expect(r.safe).toBe(false);
      expect(r.stopMessage).toBeTruthy();
    });
  }
});

describe('Safety — crisis keyword detection (English)', () => {
  const CRISIS_EN = [
    'I want to kill myself',
    'thinking about self-harm',
    'suicidal thoughts',
  ];

  for (const msg of CRISIS_EN) {
    it(`stops on: "${msg}"`, () => {
      const r = preCheck(msg);
      expect(r.safe).toBe(false);
    });
  }
});

describe('Safety — embedded in longer text', () => {
  it('catches crisis keyword inside a longer sentence', () => {
    const r = preCheck('הכל קשה לי מאוד ואני מרגיש שאני רוצה למות כבר');
    expect(r.safe).toBe(false);
  });

  it('catches crisis with surrounding context', () => {
    const r = preCheck('לפעמים עולות לי מחשבות על פגיעה עצמית');
    expect(r.safe).toBe(false);
  });
});

describe('Safety — safe messages pass through', () => {
  const SAFE = [
    'קניתי בשר לא איכותי',
    'אני כועס על החבר שלי',
    'זה ממש מתסכל אותי',
    'אני מרגיש רע',
    'הכל נהרס',
    'אני שונא את עצמי',
    'מה אתה היית עושה?',
    'זה מיותר',
    'אני לא רוצה לדבר על זה',
    '',
  ];

  for (const msg of SAFE) {
    it(`passes: "${msg || '(empty)'}"`, () => {
      const r = preCheck(msg);
      expect(r.safe).toBe(true);
      expect(r.stopMessage).toBeNull();
    });
  }
});

describe('Safety — stop message content', () => {
  it('includes ער"ן hotline number', () => {
    const r = preCheck('רוצה למות');
    expect(r.stopMessage).toContain('1201');
  });

  it('does not contain clinical jargon', () => {
    const r = preCheck('רוצה למות');
    expect(r.stopMessage).not.toMatch(/אבחון|טיפול|פסיכולוג/);
  });
});

describe('Safety — signposting integration', () => {
  it('exports the signpost map for all stages 2–7', () => {
    // Verifies the content module is importable and complete.
    const { SIGNPOST } = require('../../src/content/signposting.js');
    expect(Object.keys(SIGNPOST).length).toBe(6);
    for (let s = 2; s <= 7; s++) {
      expect(SIGNPOST[s]).toBeTruthy();
      expect(typeof SIGNPOST[s]).toBe('string');
    }
  });
});
