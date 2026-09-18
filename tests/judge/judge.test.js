import { describe, it, expect, vi } from 'vitest';
import {
  formatTranscript,
  parseJudgeScores,
  meetsThreshold,
  judgeTranscript,
  buildJudgePrompt,
  JUDGE_DIMENSIONS,
} from '../../src/core/judge.js';
import { meatTranscript } from '../fixtures/meat-transcript.js';

const FULL = { empathy: 5, non_judgment: 5, ownership: 5, active_listening: 4, natural_hebrew: 5 };

describe('formatTranscript', () => {
  it('labels assistant as מראיין and user as מרואיין', () => {
    const out = formatTranscript([
      { role: 'assistant', content: 'מה קרה?' },
      { role: 'user', content: 'משהו קרה' },
    ]);
    expect(out).toBe('מראיין: מה קרה?\nמרואיין: משהו קרה');
  });

  it('skips malformed entries', () => {
    expect(formatTranscript([{ role: 'user' }, null])).toBe('');
  });
});

describe('parseJudgeScores', () => {
  it('parses a valid score object (ignoring surrounding prose)', () => {
    const raw = `הנה הציון:\n${JSON.stringify({ ...FULL, notes: 'טוב' })}`;
    const res = parseJudgeScores(raw);
    expect(res.ok).toBe(true);
    expect(res.scores).toEqual(FULL);
    expect(res.notes).toBe('טוב');
  });

  it('rejects when a dimension is missing', () => {
    const { active_listening, ...partial } = FULL;
    expect(parseJudgeScores(JSON.stringify(partial)).ok).toBe(false);
  });

  it('rejects out-of-range scores', () => {
    expect(parseJudgeScores(JSON.stringify({ ...FULL, empathy: 6 })).ok).toBe(false);
    expect(parseJudgeScores(JSON.stringify({ ...FULL, empathy: 0 })).ok).toBe(false);
  });

  it('rejects non-JSON', () => {
    expect(parseJudgeScores('no json here').ok).toBe(false);
  });
});

describe('meetsThreshold', () => {
  it('passes when every dimension ≥ threshold', () => {
    expect(meetsThreshold(FULL, 4)).toBe(true);
  });

  it('fails when any dimension is below threshold', () => {
    expect(meetsThreshold({ ...FULL, ownership: 3 }, 4)).toBe(false);
  });
});

describe('judgeTranscript (injectable fetch)', () => {
  it('sends the rubric as system + transcript as user and returns parsed scores', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify(FULL) }] }),
    }));

    const res = await judgeTranscript({
      history: [{ role: 'assistant', content: 'מה קרה?' }],
      apiKey: 'sk-ant-test',
      fetchImpl,
    });

    expect(res.ok).toBe(true);
    expect(res.scores).toEqual(FULL);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.system).toBe(buildJudgePrompt());
    expect(body.messages[0].content).toContain('מראיין: מה קרה?');
  });

  // The bug the first cloud gate run surfaced (18.9.2026): sonnet-5 LEADS its
  // reply with a `thinking` block that has no `.text`, so `content[0].text` was
  // '' and the judge reported `no_json` — indistinguishable from a bad answer.
  // These two lock the fix in from both sides: read the right block, and don't
  // let the block appear in the first place.
  it('reads the first block that carries text, not content[0]', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: 'the interviewer opened with...' },
          { type: 'text', text: JSON.stringify(FULL) },
        ],
      }),
    }));

    const res = await judgeTranscript({ history: [], apiKey: 'k', fetchImpl });
    expect(res.ok, res.error).toBe(true);
    expect(res.scores).toEqual(FULL);
  });

  it('disables thinking, so the reply is the JSON envelope and nothing else', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ content: [{ text: JSON.stringify(FULL) }] }),
    }));

    await judgeTranscript({ history: [], apiKey: 'k', fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('returns an error result on HTTP failure', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, text: async () => 'rate limited' }));
    const res = await judgeTranscript({ history: [], apiKey: 'k', fetchImpl });
    expect(res.ok).toBe(false);
  });
});

// --- Integration: real API. Opt-in only (paid + non-deterministic): needs a
// valid key AND RUN_JUDGE=1, so routine `npm test` and CI both skip it.
// Acceptance run: `RUN_JUDGE=1 npm test` (PowerShell: `$env:RUN_JUDGE='1'`). ---

// Server-side name only — never VITE_-prefixed, so it is never bundled to the
// browser. Run with: ANTHROPIC_API_KEY=sk-ant-... RUN_JUDGE=1 npm test
const apiKey = process.env.ANTHROPIC_API_KEY;
const hasKey = typeof apiKey === 'string' && apiKey.startsWith('sk-ant-') && apiKey.length > 30;
const runJudge = process.env.RUN_JUDGE === '1';

describe.skipIf(!hasKey || !runJudge)('LLM-judge acceptance (real API)', () => {
  it(
    'scores the meat golden transcript ≥ 4 on every dimension',
    async () => {
      const res = await judgeTranscript({ history: meatTranscript, apiKey });

      // Emitted BEFORE the assertions, so it appears whether the gate passes or
      // fails. `npm run gates` reads this line. It used to infer the outcome from
      // vitest's own output, which prints a describe name and an assertion message
      // only on FAILURE — so a judge that ran and passed was reported as "skipped",
      // and a run that scored 5/5 looked like a run that never happened.
      console.log(`JUDGE_RESULT ${JSON.stringify({
        ok: res.ok,
        error: res.error ?? '',
        scores: res.scores ?? {},
        notes: res.notes ?? '',
        // What the model actually said, when it could not be parsed. Without it a
        // repeat `no_json` is undiagnosable from the report alone.
        raw: res.ok ? '' : String(res.raw ?? '').slice(0, 400),
      })}`);

      // The API's own words, not a bare boolean. judgeTranscript returns
      // { ok:false, error:<response body> } and the assertion used to throw away
      // the one field that says WHY — which in CI meant a red run with no cause.
      expect(res.ok, `judge call failed → ${res.error ?? '(no error text)'}`).toBe(true);
      for (const dim of JUDGE_DIMENSIONS) {
        expect(res.scores[dim], `${dim}: ${res.notes}`).toBeGreaterThanOrEqual(4);
      }
    },
    30000
  );
});
