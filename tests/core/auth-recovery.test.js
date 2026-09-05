import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { complete } from '../../src/adapters/model.js';
import { setAppPassword, getAppPassword } from '../../src/adapters/appAuth.js';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../../src/core/session.js';

// A 401 from the proxy is a LOCKED DOOR, not a failed model call.
//
// This is the failure that broke a live preview and was invisible from outside:
// VITE_REQUIRE_PASSWORD was stored as a Vercel secret, secrets are not exposed to
// the build, so Vite inlined nothing, the gate never rendered, no password was
// stored, no `x-app-password` was sent, and the proxy — which DID hold
// APP_PASSWORD — answered 401 on every turn. The person saw "model error" over a
// door that was merely locked. These tests hold the recovery in place.

const live = () => {
  vi.stubEnv('VITE_USE_MOCK', 'false');
  vi.stubEnv('VITE_REQUIRE_PASSWORD', ''); // the flag missing is the whole point
};

beforeEach(() => {
  // sessionStorage is not in the node test env; appAuth already swallows that,
  // so a stub keeps the round trip observable.
  const store = new Map();
  vi.stubGlobal('sessionStorage', {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  });
});
afterEach(() => vi.unstubAllEnvs() || vi.unstubAllGlobals());

describe('a 401 is a locked door, not a model failure', () => {
  it('reports `unauthorized` instead of a generic model error', async () => {
    live();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' }));
    const r = await complete({ stage: 1, systemPrompt: 'x', messages: [{ role: 'user', content: 'y' }] });
    expect(r.unauthorized).toBe(true);
    expect(r.message).not.toContain('שגיאה בחיבור למודל');
  });

  it('clears the stored password, so the next attempt asks for it again', async () => {
    live();
    setAppPassword('wrong-one');
    expect(getAppPassword()).toBe('wrong-one');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' }));
    await complete({ stage: 1, systemPrompt: 'x', messages: [{ role: 'user', content: 'y' }] });
    expect(getAppPassword()).toBe('');
  });

  it('sends the password once it is stored', async () => {
    live();
    setAppPassword('right-one');
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' });
    vi.stubGlobal('fetch', f);
    await complete({ stage: 1, systemPrompt: 'x', messages: [{ role: 'user', content: 'y' }] });
    expect(f.mock.calls[0][1].headers['x-app-password']).toBe('right-one');
  });

  it('does not advance the interview by so much as a counter', async () => {
    // A locked door consumed no turn. If state moved, the person would come back
    // through the gate into an interview that had silently progressed without them.
    live();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' }));
    const before = createState();
    const { nextState, unauthorized } = await runTurn(before, [], 'הסיפור שלי');
    expect(unauthorized).toBe(true);
    expect(nextState.meta.questionCount).toBe(before.meta.questionCount);
    expect(nextState.meta.saturationCount).toBe(before.meta.saturationCount);
    expect(nextState.coverage).toEqual(before.coverage);
  });

  it('still fails loudly on a real model error', async () => {
    live();
    setAppPassword('pw');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }));
    const r = await complete({ stage: 1, systemPrompt: 'x', messages: [{ role: 'user', content: 'y' }] });
    expect(r.unauthorized).toBeUndefined();
    expect(r.message).toContain('שגיאה בחיבור למודל');
  });
});
