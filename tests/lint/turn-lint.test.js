import { describe, it, expect } from 'vitest';
import { MOCK_RESPONSES } from '../../src/adapters/model.js';
import { FORBIDDEN_PATTERNS } from '../../src/content/forbidden.js';

// --- Lint utilities ---

function questionCount(text) {
  return (text.match(/\?/g) ?? []).length;
}

// Extract human-readable triggers from FORBIDDEN_PATTERNS (the part after "אסור: ")
const FORBIDDEN_TERMS = [
  'פרשנות חלופית',
  'תגובה אדפטיבית',
  'שלב 1', 'שלב 2', 'שלב 3', 'שלב 4', 'שלב 5', 'שלב 6', 'שלב 7',
  'כדאי לך',
  'אני ממליץ',
  'הייתי עושה',
  'אפשר לדבר על',
  'רוצה שנמשיך',
  'על מה תרצה לדבר',
];

function containsForbiddenJargon(text) {
  return FORBIDDEN_TERMS.some((term) => text.includes(term));
}

function sentenceCountBeforeQuestion(text) {
  const lastQ = text.lastIndexOf('?');
  if (lastQ === -1) return 0;
  const before = text.slice(0, lastQ);
  return (before.match(/[.!]/g) ?? []).length;
}

// Is this a placeholder / board display turn that is exempt from one-question rule?
function isExemptTurn(key) {
  return key === '7:1'; // board presentation — no question expected
}

// --- Lint rule unit tests ---

describe('questionCount', () => {
  it('counts one question mark', () => {
    expect(questionCount('מה קרה?')).toBe(1);
  });

  it('counts two question marks', () => {
    expect(questionCount('מה קרה? ואיפה?')).toBe(2);
  });

  it('returns 0 when no question mark', () => {
    expect(questionCount('בוא נדבר.')).toBe(0);
  });
});

describe('containsForbiddenJargon', () => {
  it('catches פרשנות חלופית', () => {
    expect(containsForbiddenJargon('נדבר על פרשנות חלופית')).toBe(true);
  });

  it('catches stage label jargon', () => {
    expect(containsForbiddenJargon('אנחנו עכשיו בשלב 3')).toBe(true);
  });

  it('catches recommendation jargon', () => {
    expect(containsForbiddenJargon('אני ממליץ שתבחר')).toBe(true);
  });

  it('passes on normal Hebrew', () => {
    expect(containsForbiddenJargon('ספר לי מה קרה?')).toBe(false);
  });
});

describe('sentenceCountBeforeQuestion', () => {
  it('counts 2 sentences before question', () => {
    expect(sentenceCountBeforeQuestion('בוא נדבר. הסיפור שלך מעניין. מה קרה?')).toBe(2);
  });

  it('counts 0 when only question', () => {
    expect(sentenceCountBeforeQuestion('מה קרה?')).toBe(0);
  });

  it('counts 4 sentences — over limit', () => {
    expect(sentenceCountBeforeQuestion('א. ב. ג. ד. מה קרה?')).toBe(4);
  });
});

// --- Mock response lint sweep ---

describe('mock responses pass lint rules', () => {
  for (const [key, response] of Object.entries(MOCK_RESPONSES)) {
    const { message } = response;

    it(`${key}: no forbidden jargon`, () => {
      expect(containsForbiddenJargon(message)).toBe(false);
    });

    it(`${key}: at most one question mark`, () => {
      expect(questionCount(message)).toBeLessThanOrEqual(1);
    });

    if (!isExemptTurn(key)) {
      it(`${key}: max 3 sentences before question`, () => {
        expect(sentenceCountBeforeQuestion(message)).toBeLessThanOrEqual(3);
      });
    }
  }
});
