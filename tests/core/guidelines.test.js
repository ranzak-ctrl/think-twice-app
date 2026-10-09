// Interviewer guidelines: a super file every Think Twice interviewer shares, and a
// specific file per interview that beats it (Ran, 9.10.2026). src/core/guidelines.js.

import { describe, it, expect } from 'vitest';
import { checkGuidelines, composeGuidelines } from '../../src/core/guidelines.js';

const SUPER = [
  '<!-- @identity required -->',
  '<!-- @listening -->',
  'Every question comes out of the last answer.',
  '',
  '<!-- @warmth -->',
  'Warm, never flattering.',
  '',
  '<!-- @one-question locked -->',
  'Exactly one question per turn.',
  '',
].join('\n');

const ADULT = ['<!-- @identity -->', 'You interview adults.', ''].join('\n');

describe('composing the guidelines', () => {
  it('fills the required block and keeps the super order, with no marker left', () => {
    const text = composeGuidelines({ super: SUPER, specific: ADULT });
    expect(text).toBe(
      'You interview adults.\n' +
        'Every question comes out of the last answer.\n\n' +
        'Warm, never flattering.\n\n' +
        'Exactly one question per turn.\n'
    );
    expect(text).not.toContain('<!--');
  });

  it('lets the specific file replace a block in place — the specific beats the super', () => {
    const children = ADULT + ['<!-- @warmth -->', 'Warmer still: small steps, never a confrontation.', '', ''].join('\n');
    const text = composeGuidelines({ super: SUPER, specific: children });
    expect(text).toContain('Warmer still');
    // The replaced rule is gone, not left beside its replacement for the model to weigh.
    expect(text).not.toContain('Warm, never flattering.');
    // In place: before the locked rule, where the super file put it.
    expect(text.indexOf('Warmer still')).toBeLessThan(text.indexOf('Exactly one question'));
  });

  it('appends what only the specific file has, after the super blocks', () => {
    const parents = ADULT + ['<!-- @matter-of-fact -->', 'Keep it practical.', ''].join('\n');
    const text = composeGuidelines({ super: SUPER, specific: parents });
    expect(text.endsWith('Keep it practical.\n')).toBe(true);
  });

  it('refuses to override a locked block', () => {
    const r = checkGuidelines({ super: SUPER, specific: ADULT + '<!-- @one-question -->\nTwo questions are fine.\n' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('locked');
  });

  it('refuses a specific file that does not say who the interview is', () => {
    const r = checkGuidelines({ super: SUPER, specific: '<!-- @warmth -->\nWarm.\n' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('required block "identity"');
  });

  it('refuses a specific file that tries to lock or require', () => {
    const r = checkGuidelines({ super: SUPER, specific: '<!-- @identity locked -->\nYou interview adults.\n' });
    expect(r.errors.join(' ')).toContain('only the super file');
  });

  it('drops an author\'s note — a version line never reaches the model', () => {
    const noted = '<!-- # super.md — v1 · 9.10.2026 -->\n' + SUPER;
    expect(composeGuidelines({ super: noted, specific: ADULT })).toBe(composeGuidelines({ super: SUPER, specific: ADULT }));
  });

  it('refuses a marker typed wrong — it would reach the model as text', () => {
    const r = checkGuidelines({ super: SUPER, specific: ADULT + '<!-- @Warmth -->\nWarm.\n' });
    expect(r.errors.join(' ')).toContain('malformed marker');
  });

  it('refuses text outside any block', () => {
    const r = checkGuidelines({ super: SUPER, specific: 'Stray line.\n' + ADULT });
    expect(r.errors.join(' ')).toContain('before the first marker');
  });

  it('refuses the same block twice in one file', () => {
    const r = checkGuidelines({ super: SUPER, specific: ADULT + '<!-- @identity -->\nAgain.\n' });
    expect(r.errors.join(' ')).toContain('appears twice');
  });

  // router-guard, 9.10.2026 — inputs that used to compose "ok" and were wrong.
  it('refuses an empty override — it would delete the super rule in silence', () => {
    // The realistic cause: a line forgotten between two markers.
    const r = checkGuidelines({ super: SUPER, specific: ADULT + '<!-- @warmth -->\n<!-- @voice -->\nNew voice.\n' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('"warmth" overrides the super file with nothing');
  });

  for (const [name, bad] of [
    ['a note split over two lines', '<!-- # v2 ·\n9.10 -->\n'],
    ['a note with text after it', '<!-- # v2 --> real text\n'],
    ['a note that would swallow text between two comments', '<!-- # a --> real text <!-- b -->\n'],
    ['a marker without its @', '<!-- warmth -->\nWarm.\n'],
    ['a marker with an extra dash', '<!--- @warmth -->\nWarm.\n'],
    ['a marker split over two lines', '<!-- @warmth\n-->\nWarm.\n'],
  ]) {
    it(`refuses ${name} — no comment may reach the model`, () => {
      const r = checkGuidelines({ super: SUPER, specific: ADULT + bad });
      expect(r.ok).toBe(false);
    });
  }

  it('refuses a comment in the middle of a line, as the last line of defence', () => {
    const r = checkGuidelines({ super: SUPER, specific: '<!-- @identity -->\nYou interview adults. <!-- hidden -->\n' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('would reach the model');
  });

  it('refuses a block that does not end its last line — it would glue onto the next', () => {
    const r = checkGuidelines({ super: SUPER, specific: '<!-- @identity -->\nYou interview adults.' });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toContain('must end with a newline');
  });

  it('reports instead of throwing on a missing file, and throws only when asked to compose', () => {
    expect(checkGuidelines(undefined).ok).toBe(false);
    expect(checkGuidelines({ super: SUPER }).ok).toBe(false);
    expect(() => composeGuidelines({ super: SUPER })).toThrow(/cannot be composed/);
  });
});
