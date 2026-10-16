import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { complete, chooseModel, DEFAULT_MODEL, PREVIEW_MODEL } from '../../src/adapters/model.js';

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

// The error report's whole licence to exist is that it carries no interview
// content (principle 6: "אסור לאחסן תוכן משתמש מחוץ לדפדפן"). The adapter builds
// the metadata, so the guarantee is enforced here. If a future change starts
// passing the upstream body or the prompt through, these fail.
describe('adapter complete() — failure metadata carries no interview content', () => {
  const SECRET_PROMPT = 'SYSTEM_PROMPT_SENTINEL_דמות_גלובלית';
  const SECRET_USER = 'USER_TEXT_SENTINEL_קניתי_בשר_לא_איכותי';
  const LOADED = {
    stage: 2,
    systemPrompt: SECRET_PROMPT,
    messages: [{ role: 'user', content: SECRET_USER }],
  };

  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // An upstream error body that echoes the request — the realistic worst case,
  // and the reason the body is reduced to `error.type` rather than passed along.
  const echoingError = JSON.stringify({
    type: 'error',
    error: { type: 'invalid_request_error', message: `bad input near: ${SECRET_USER}` },
  });

  it('reduces an upstream error body to its type and keeps the request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        headers: { get: (h) => (h === 'x-request-id' ? 'abc12345' : null) },
        text: async () => echoingError,
        json: async () => JSON.parse(echoingError),
      }))
    );

    const res = await complete(LOADED);

    expect(res.ok).toBe(false);
    expect(res.failure.kind).toBe('http');
    expect(res.failure.status).toBe(400);
    expect(res.failure.requestId).toBe('abc12345');
    expect(res.failure.detail).toBe('invalid_request_error');
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_USER);
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_PROMPT);
  });

  it('reports a network failure without the prompt or the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND');
      })
    );

    const res = await complete(LOADED);

    expect(res.failure.kind).toBe('network');
    expect(res.failure.stage).toBe(2);
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_USER);
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_PROMPT);
  });

  it('reports an exhausted JSON retry and still names the logged request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (h) => (h === 'x-request-id' ? 'req98765' : null) },
        json: async () => ({
          content: [{ type: 'text', text: `prose, not json — ${SECRET_USER}` }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        text: async () => '',
      }))
    );

    const res = await complete(LOADED);

    expect(res.failure.kind).toBe('parse_failed');
    expect(res.failure.requestId).toBe('req98765');
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_USER);
    expect(JSON.stringify(res.failure)).not.toContain(SECRET_PROMPT);
  });

  it('adds no failure object to a successful turn', async () => {
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    const res = await complete(ARGS);

    expect(res.ok).toBe(true);
    expect(res.failure ?? null).toBeNull();
  });
});


// The registrar's reply is a whole graph delta in Hebrew, not a three-sentence
// turn. Before 19.9.2026 it shared the interviewer's max_tokens of 1024, which
// would have truncated it mid-JSON on any rich turn — and truncation there is
// invisible twice over: parseRegistrarResponse returns invalid_json and
// runRegistrar deliberately returns the state untouched, so the graph stops
// growing exactly as the interview gets richer (silently, until guide mode and the
// error report learned to say so on 16.10.2026).
describe('registrar mode — headroom and truncation', () => {
  const body = async (fetchImpl) => {
    await complete({ stage: 1, systemPrompt: 'sys', messages: [{ role: 'user', content: 'x' }], mode: 'registrar', fetchImpl });
    return JSON.parse(fetchImpl.mock.calls[0][1].body);
  };

  it('asks for far more room than an interviewer turn', async () => {
    const reg = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ text: '{}' }], usage: {} }) }));
    const turn = vi.fn(async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ content: [{ text: '{"message":"m","evaluation":{}}' }], usage: {} }) }));

    expect((await body(reg)).max_tokens).toBe(8192);
    await complete({ stage: 1, systemPrompt: 'sys', messages: [{ role: 'user', content: 'x' }], fetchImpl: turn });
    expect(JSON.parse(turn.mock.calls[0][1].body).max_tokens).toBe(1024);
  });

  it('names a truncated reply instead of letting it surface as invalid JSON', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ stop_reason: 'max_tokens', content: [{ text: '{"beats":[{"id":"b1","lab' }], usage: {} }),
    }));
    const res = await complete({ stage: 1, systemPrompt: 'sys', messages: [{ role: 'user', content: 'x' }], mode: 'registrar', fetchImpl });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('registrar_truncated');
  });

  it('still returns the text when the reply ended normally', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ stop_reason: 'end_turn', content: [{ text: '{"beats":[]}' }], usage: {} }),
    }));
    const res = await complete({ stage: 1, systemPrompt: 'sys', messages: [{ role: 'user', content: 'x' }], mode: 'registrar', fetchImpl });
    expect(res.ok).toBe(true);
    expect(res.raw).toBe('{"beats":[]}');
  });
});

// The two model families take OPPOSITE defaults for thinking, so the opt-out has
// to be written per family — and sending the wrong shape is a 400 on a person's
// turn. Sonnet 5 and the 4.6+ families think unless told not to, so they need the
// explicit `disabled`. Haiku 4.5 does not think unless asked with
// `{type:'enabled', budget_tokens}`, so for it the field's ABSENCE is the opt-out.
//
// Either way the intent is one thing: this flow wants a compact JSON envelope and
// never reasoning tokens, which cost money and eat max_tokens.
describe('adapter complete() — thinking is opted out per model family', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const bodyOf = (fetchStub) => JSON.parse(fetchStub.mock.calls[0][1].body);

  it('omits the field on Haiku, where sending a thinking config is the way to turn it ON', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-haiku-4-5');
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete(ARGS);

    const body = bodyOf(fetchStub);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body).not.toHaveProperty('thinking');
  });

  it('still sends the explicit opt-out on a model that thinks by default', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-sonnet-5');
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete(ARGS);

    expect(bodyOf(fetchStub).thinking).toEqual({ type: 'disabled' });
  });

  // The registrar's reply is a whole Hebrew JSON graph and truncation there is the
  // worst failure in the system — silent twice over. Reasoning tokens would be
  // charged against the same ceiling.
  it('keeps the registrar headroom free of reasoning tokens', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-haiku-4-5');
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    await complete({ ...ARGS, mode: 'registrar' });

    const body = bodyOf(fetchStub);
    expect(body.max_tokens).toBe(8192);
    expect(body).not.toHaveProperty('thinking');
  });
});

// Ran, 16.10.2026: the QA link (a Vercel Preview build) runs on Sonnet 5.5;
// production keeps Haiku. Sonnet 5.5 rejects `disabled` thinking with a 400 — its
// thinking-off setting is `between_tools` — and its safety classifiers can decline
// a turn, which must not be retried as if it were broken JSON.
describe('adapter complete() — Sonnet 5.5 on the QA link', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const bodyOf = (fetchStub) => JSON.parse(fetchStub.mock.calls[0][1].body);

  it('names Sonnet 5.5 in a Preview build, Haiku in production, and VITE_MODEL over both', () => {
    expect(PREVIEW_MODEL).toBe('claude-sonnet-5-5');
    expect(DEFAULT_MODEL).toBe('claude-haiku-4-5');
    expect(chooseModel({ env: {}, preview: true })).toBe('claude-sonnet-5-5');
    expect(chooseModel({ env: {}, preview: false })).toBe('claude-haiku-4-5');
    expect(chooseModel({ env: { VITE_MODEL: 'claude-sonnet-5' }, preview: true })).toBe('claude-sonnet-5');
  });

  it('a test run, like production, is not a Preview build', () => {
    expect(chooseModel({ env: {} })).toBe('claude-haiku-4-5');
  });

  it('turns thinking off with between_tools, alone in the field', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-sonnet-5-5');
    const fetchStub = makeFetch([VALID]);
    vi.stubGlobal('fetch', fetchStub);

    const r = await complete(ARGS);

    const body = bodyOf(fetchStub);
    expect(r.ok).toBe(true);
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.thinking).toEqual({ type: 'between_tools' });
    expect(body).not.toHaveProperty('output_config');
    expect(body).not.toHaveProperty('temperature');
  });

  it('a declined turn ends at once, named as a refusal, with no interview content', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-sonnet-5-5');
    const fetchStub = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'rid123' },
      json: async () => ({
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'general_harms', explanation: 'x' },
        usage: { input_tokens: 10, output_tokens: 0 },
      }),
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchStub);

    const r = await complete(ARGS);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ ok: false, error: 'refusal' });
    expect(r.failure).toMatchObject({ kind: 'refusal', detail: 'model declined (general_harms)' });
    expect(JSON.stringify(r.failure)).not.toContain('hi');
  });

  it('a declined registrar call costs the person nothing: no message', async () => {
    vi.stubEnv('VITE_MODEL', 'claude-sonnet-5-5');
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ content: [], stop_reason: 'refusal', stop_details: null, usage: {} }),
      text: async () => '',
    })));

    const r = await complete({ ...ARGS, mode: 'registrar' });

    expect(r).toMatchObject({ ok: false, error: 'refusal', message: null });
    expect(r.failure.detail).toBe('model declined (no category)');
  });
});
