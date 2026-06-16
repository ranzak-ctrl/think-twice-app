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

  it('returns an error result on HTTP failure', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, text: async () => 'rate limited' }));
    const res = await judgeTranscript({ history: [], apiKey: 'k', fetchImpl });
    expect(res.ok).toBe(false);
  });
});

// --- Integration: real API. Opt-in only (paid + non-deterministic): needs a
// valid key AND RUN_JUDGE=1, so routine `npm test` and CI both skip it.
// Acceptance run: `RUN_JUDGE=1 npm test` (PowerShell: `$env:RUN_JUDGE='1'`). ---

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
const hasKey = typeof apiKey === 'string' && apiKey.startsWith('sk-ant-') && apiKey.length > 30;
const runJudge = process.env.RUN_JUDGE === '1';

describe.skipIf(!hasKey || !runJudge)('LLM-judge acceptance (real API)', () => {
  it(
    'scores the meat golden transcript ≥ 4 on every dimension',
    async () => {
      const res = await judgeTranscript({ history: meatTranscript, apiKey });
      expect(res.ok).toBe(true);
      for (const dim of JUDGE_DIMENSIONS) {
        expect(res.scores[dim], `${dim}: ${res.notes}`).toBeGreaterThanOrEqual(4);
      }
    },
    30000
  );
});
