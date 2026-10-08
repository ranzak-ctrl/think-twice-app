// Prompt caching — the measured problem, and the guard that it stays fixed.
//
// First live run with the registrar on (19.9.2026): 42,890 input tokens and $0.14
// for ONE turn, so roughly $4 for a thirty-turn interview, per tester, before they
// have said anything interesting. evaluator.md is 46KB and registrar.md is 48.5KB
// and both were re-sent in full on every turn.
//
// Caching only works on a stable PREFIX, so these tests pin the two things that
// make or break it: the unchanging half really is unchanging across turns, and the
// marker really is attached to it on the wire.

import { describe, it, expect, vi } from 'vitest';
import { REGISTRAR_ENABLED } from '../../src/core/promptBuilder.js';
import { buildSystemPromptParts, buildSystemPrompt, buildRegistrarPrompt } from '../helpers/engine.js';
import { createState, mergeActorMap } from '../../src/core/state.js';
import { complete } from '../../src/adapters/model.js';

const withStuff = () => {
  let s = createState();
  s = mergeActorMap(s, [{ id: 'a1', name: 'הספק', role: 'ספק', clear: true }], 1);
  return { ...s, coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 2 } } };
};

describe('the cached half is actually stable', () => {
  it('does not change when the interview state changes', () => {
    const a = buildSystemPromptParts({ stage: 1, state: createState() });
    const b = buildSystemPromptParts({ stage: 1, state: withStuff() });
    expect(a.stable).toBe(b.stable);
    // If this ever became equal too, nothing would be varying and the split would
    // be pointless — so the test asserts the halves really are different jobs.
    expect(a.volatile).not.toBe(b.volatile);
  });

  it('carries the big static prompt, which is the whole point', () => {
    const { stable } = buildSystemPromptParts({ stage: 1, state: createState() });
    expect(stable.length).toBeGreaterThan(20000);
  });

  it('keeps the joined form identical to the two halves', () => {
    const p = buildSystemPromptParts({ stage: 3, state: withStuff() });
    expect(buildSystemPrompt({ stage: 3, state: withStuff() })).toBe(`${p.stable}\n\n---\n\n${p.volatile}`);
  });

  it('the registrar prompt splits the same way when the switch is on', () => {
    const r = buildRegistrarPrompt({ state: withStuff() });
    if (!REGISTRAR_ENABLED) { expect(r).toBe(''); return; }
    expect(r.stable.length).toBeGreaterThan(20000);
    expect(r.stable).toBe(buildRegistrarPrompt({ state: createState() }).stable);
  });
});

describe('the marker reaches the wire', () => {
  const send = async (systemPrompt) => {
    const fetchImpl = vi.fn(async () => ({
      ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ stop_reason: 'end_turn', content: [{ text: '{"message":"m","evaluation":{}}' }], usage: {} }),
    }));
    await complete({ stage: 1, systemPrompt, messages: [{ role: 'user', content: 'x' }], fetchImpl });
    return JSON.parse(fetchImpl.mock.calls[0][1].body).system;
  };

  it('marks the stable block cacheable and leaves the volatile one alone', async () => {
    const system = await send({ stable: 'STATIC', volatile: 'CHANGES' });
    expect(system).toEqual([
      { type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'CHANGES' },
    ]);
  });

  // Order is not cosmetic: everything up to and including the marked block is the
  // cached prefix, so the volatile half must come after it. Reversed, the prefix
  // changes every turn and caching never hits.
  it('puts the stable block first', async () => {
    const system = await send({ stable: 'STATIC', volatile: 'CHANGES' });
    expect(system[0].text).toBe('STATIC');
    expect(system[1].cache_control).toBeUndefined();
  });

  it('still accepts a plain string, unchanged', async () => {
    expect(await send('just a string')).toBe('just a string');
  });
});
