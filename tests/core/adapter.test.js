import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { complete } from '../../src/adapters/model.js';

// JSON-stability retry (dev-plan §148). These tests force the real (network) path
// with VITE_USE_MOCK=false and a stubbed fetch, then verify the adapter retries a
// malformed response, sums usage, and fails gracefully when retries are exhausted.

// Build a fetch stub that returns one scripted assistant `text` per call.
function makeFetch(rawTexts) {
  let i = 0;
  return vi.fn(async () => {
    const text = rawTexts[Math.min(i, rawTexts.length - 1)];
    i++;
    return {
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      text: async () => '',
    };
  });
}

const VALID = JSON.stringify({ message: 'שלום', evaluation: { slots: { trigger: 1 } } });
const ARGS = { stage: 1, systemPrompt: 'sys', messages: [{ role: 'user', content: 'hi' }] };

describe('adapter complete() — JSON retry', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns the parse on the first try when JSON is valid (one call)', async () => {
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete(ARGS);

    expect(result.ok).toBe(true);
    expect(result.message).toBe('שלום');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  // Regression: models that think (sonnet-5 runs adaptive thinking by default)
  // lead with a `thinking` block. Reading content[0].text there returned '' and
  // the turn failed with no_json even though the API call succeeded.
  it('reads the text block when a thinking block comes first', async () => {
    const fetchStub = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'text', text: VALID },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete(ARGS);

    expect(result.ok).toBe(true);
    expect(result.message).toBe('שלום');
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('retries on malformed JSON and succeeds, summing usage across attempts', async () => {
    const fetchStub = makeFetch(['this is not json', VALID]);
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete(ARGS);

    expect(result.ok).toBe(true);
    expect(result.message).toBe('שלום');
    expect(fetchStub).toHaveBeenCalledTimes(2);
    // Usage summed over both calls (10+10 in, 5+5 out).
    expect(result.usage).toEqual({ input_tokens: 20, output_tokens: 10 });
  });

  it('feeds a repair nudge back into the messages on retry', async () => {
    const fetchStub = makeFetch(['broken', VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete(ARGS);

    const retryBody = JSON.parse(fetchStub.mock.calls[1][1].body);
    // Original user turn + broken assistant turn + repair user turn.
    expect(retryBody.messages.length).toBe(3);
    expect(retryBody.messages.some((m) => m.content.includes('JSON'))).toBe(true);
  });

  it('gives up gracefully after MAX_ATTEMPTS when JSON never parses', async () => {
    const fetchStub = makeFetch(['nope', 'still nope', 'argh']);
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete(ARGS);

    expect(result.ok).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(3); // MAX_ATTEMPTS
    expect(result.message).toBeTruthy(); // user still sees a (fallback) reply
    expect(result.evaluation).toBeNull();
    // Usage from all three failed attempts is still reported.
    expect(result.usage).toEqual({ input_tokens: 30, output_tokens: 15 });
  });

  it('does not retry on an HTTP error (fail fast)', async () => {
    const fetchStub = vi.fn(async () => ({ ok: false, text: async () => 'overloaded' }));
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete(ARGS);

    expect(result.ok).toBe(false);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(result.message).toBeTruthy();
  });

  // Summary mode is plain text — the model returns prose, which must NOT be forced
  // through JSON parsing (live bug: no_json on every summary). (test-plan §א.5)
  it('summary mode takes the raw text as the message — no JSON, no retry', async () => {
    const prose = 'בוא נוודא שהבנתי נכון — קרה כך וכך. זה מדויק?';
    const fetchStub = makeFetch([prose]);
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete({ ...ARGS, mode: 'summary' });

    expect(result.ok).toBe(true);
    expect(result.message).toBe(prose);
    expect(result.evaluation).toBeNull();
    expect(fetchStub).toHaveBeenCalledTimes(1); // no JSON-repair retry
  });

  it('summary mode fails on an empty response', async () => {
    const fetchStub = makeFetch(['   ']);
    vi.stubGlobal('fetch', fetchStub);

    const result = await complete({ ...ARGS, mode: 'summary' });

    expect(result.ok).toBe(false);
  });
});
