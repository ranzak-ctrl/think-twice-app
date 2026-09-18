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
    // Usage summed over both calls (10+10 in, 5+5 out). The cache buckets are
    // absent from the stubbed response and must therefore tally as 0, not
    // undefined — the meter multiplies them by a rate.
    expect(result.usage).toEqual({
      input_tokens: 20,
      output_tokens: 10,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
  });

  // Prompt caching reports two extra token buckets, billed at different rates
  // (write 1.25x, read 0.1x). They must survive the merge: `input_tokens` is
  // only the UNCACHED remainder, so dropping them under-reports cost and hides
  // whether caching is working at all.
  it('sums the cache token buckets alongside input/output', async () => {
    const withCache = (rawTexts) => {
      let i = 0;
      return vi.fn(async () => {
        const text = rawTexts[Math.min(i, rawTexts.length - 1)];
        i++;
        return {
          ok: true,
          json: async () => ({
            content: [{ type: 'text', text }],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
              cache_creation_input_tokens: 800,
              cache_read_input_tokens: 7000,
            },
          }),
          text: async () => '',
        };
      });
    };
    vi.stubGlobal('fetch', withCache(['not json', VALID]));

    const result = await complete(ARGS);

    expect(result.ok).toBe(true);
    expect(result.usage).toEqual({
      input_tokens: 20,
      output_tokens: 10,
      cache_creation_input_tokens: 1600,
      cache_read_input_tokens: 14000,
    });
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
    expect(result.usage).toEqual({
      input_tokens: 30,
      output_tokens: 15,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
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

// Injectable transport (principle 4). The live request path hardcoded a relative
// URL, which has no origin outside a browser — so no test could drive it and the
// live contract went unverified for a month (DEPLOY-STATUS, "פער אימות חי").
// These cover the seam itself; the test that actually calls the model lives in
// tests/live/ and is opt-in.
describe('adapter complete() — injectable transport', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('calls the deployed proxy path by default', async () => {
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete(ARGS);

    expect(fetchStub.mock.calls[0][0]).toBe('/api/anthropic/v1/messages');
  });

  it('uses an injected fetch and absolute url instead of the global', async () => {
    const globalStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', globalStub);
    const injected = makeFetch([VALID]);

    const result = await complete({
      ...ARGS,
      fetchImpl: injected,
      apiUrl: 'https://api.anthropic.com/v1/messages',
    });

    expect(result.ok).toBe(true);
    expect(injected).toHaveBeenCalledTimes(1);
    expect(injected.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages');
    expect(globalStub).not.toHaveBeenCalled();
  });

  // Guards 96ec371: the client must never carry a key, in any environment. The
  // proxy injects it. An apiKey argument here would reopen the leak, so passing
  // one must change nothing.
  it('never sends an x-api-key header, even if handed a key', async () => {
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete({ ...ARGS, apiKey: 'sk-ant-must-be-ignored' });

    const sent = Object.keys(fetchStub.mock.calls[0][1].headers).map((h) => h.toLowerCase());
    expect(sent).not.toContain('x-api-key');
  });
});
