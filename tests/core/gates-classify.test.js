// The gate's own verdict logic. Three bugs have lived here, all the same mistake:
// reading vitest's OUTPUT to infer what the judge DID. See scripts/gates-classify.mjs.

import { describe, it, expect } from 'vitest';
import { classifyJudge, looksLikeAuthFailure } from '../../scripts/gates-classify.mjs';

const SCORES = { empathy: 4, non_judgment: 5, ownership: 5, active_listening: 5, natural_hebrew: 5 };
const marker = (o) => `stdout | tests/judge/judge.test.js > LLM-judge acceptance (real API)\nJUDGE_RESULT ${JSON.stringify(o)}\n`;

// Verbatim from CI run 4 (19.9.2026), the line that broke it: a PASSING test whose
// NAME contains "401". Any log can contain any string.
const DECOY = ' ✓ tests/core/auth-recovery.test.js > a 401 is a locked door, not a model failure\n';

describe('classifyJudge', () => {
  it('reports a passing judge as ran, even when the log contains "401" in a test name', () => {
    const v = classifyJudge(DECOY + marker({ ok: true, error: '', scores: SCORES, notes: 'טוב', raw: '' }));
    expect(v.status).toBe('ran');
    expect(v.scores).toEqual(SCORES);
    expect(v.judgeError).toBe('');
  });

  // The knock-on was worse than the false warning: status 'rejected' made
  // gates-report.mjs withhold the comparison table and tell the reader the judge
  // returned no scores, on a run that scored 4/5/5/5/5.
  it('does not call a working key rejected because the log mentions 401 elsewhere', () => {
    const v = classifyJudge(DECOY + marker({ ok: true, error: '', scores: SCORES, notes: '', raw: '' }));
    expect(looksLikeAuthFailure(v)).toBe(false);
  });

  it('does call it rejected when the JUDGE CALL itself returned an auth error', () => {
    const v = classifyJudge(marker({ ok: false, error: '{"type":"error","error":{"type":"authentication_error"}}', scores: {}, notes: '', raw: '' }));
    expect(v.status).toBe('rejected');
    expect(looksLikeAuthFailure(v)).toBe(true);
  });

  // A parse failure is not a credential failure, and saying so sends the reader to
  // re-paste a key that was never the problem — which is what happened on run 2.
  it('separates "could not parse the reply" from "the key was rejected"', () => {
    const v = classifyJudge(marker({ ok: false, error: 'no_json', scores: {}, notes: '', raw: 'אני אתן ציון...' }));
    expect(v.status).toBe('rejected');
    expect(looksLikeAuthFailure(v)).toBe(false);
    expect(v.judgeError).toContain('no_json');
  });

  it('reports skipped only when the judge never printed its line', () => {
    expect(classifyJudge(' ✓ tests/judge/judge.test.js (12 tests | 1 skipped)\n').status).toBe('skipped');
  });

  // Without a marker the log is the only witness there is, so scanning it is sound
  // there and only there.
  it('falls back to the log when there is no marker at all', () => {
    expect(classifyJudge('invalid x-api-key\n').status).toBe('rejected');
  });

  it('treats a malformed marker as no marker rather than trusting half of it', () => {
    expect(classifyJudge('JUDGE_RESULT {not json at all}\n').status).toBe('skipped');
  });

  it('keeps unit failures separate from the judge, and excludes the judge file', () => {
    const v = classifyJudge('FAIL tests/core/state.test.js\nFAIL tests/judge/judge.test.js\n' + marker({ ok: true, error: '', scores: SCORES, notes: '', raw: '' }));
    expect(v.unitFailures).toEqual(['tests/core/state.test.js']);
  });
});
