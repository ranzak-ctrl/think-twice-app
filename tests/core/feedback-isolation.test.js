// Tester feedback is attached to history entries so it rides along in the
// session export. It must never reach the model or the judge — a note like
// "this question was too blunt" landing in the interview prompt would corrupt
// the next turn. Both formatters project role/content only; this locks that in.

import { describe, it, expect } from 'vitest';
import { formatHistory } from '../../src/core/promptBuilder.js';
import { formatTranscript } from '../../src/core/judge.js';

const NOTE = 'השאלה הזו הרגישה חוקרנית מדי';

const history = [
  { role: 'user', content: 'עזבתי את המטבח באמצע משמרת.', at: 1 },
  {
    role: 'assistant',
    content: 'מי עוד היה שם באותו רגע?',
    at: 2,
    feedback: { text: NOTE, at: 3 },
  },
  { role: 'user', content: 'הסו-שף והספק.', at: 4 },
];

describe('tester feedback never reaches the model', () => {
  it('formatHistory drops it, keeping only role and content', () => {
    const out = formatHistory(history);

    expect(JSON.stringify(out)).not.toContain(NOTE);
    for (const m of out) {
      expect(Object.keys(m).sort()).toEqual(['content', 'role']);
    }
  });

  it('formatTranscript drops it', () => {
    const out = formatTranscript(history);

    expect(out).not.toContain(NOTE);
    expect(out).toContain('מי עוד היה שם באותו רגע?');
  });

  it('leaves the annotated turn otherwise intact', () => {
    const out = formatHistory(history);
    const question = out.find((m) => m.role === 'assistant');

    expect(question.content).toBe('מי עוד היה שם באותו רגע?');
  });
});
