// What the registrar did on a turn, made visible (Ran, 16.10.2026: "הרשם נמצא
// בממשק המדריך אבל לא נראה שהוא עובד"). A registrar that failed and one that had
// nothing to record left the same empty account behind, and the failure was
// dropped on the floor. Now each turn says whether it ran, whether it failed and
// how many things it added — and a failure reaches the error report, with no
// interview content in it.

import { describe, it, expect } from 'vitest';
import { createEngine } from '../../src/core/engine.js';
import { thinkTwiceParents } from '../../src/packs/think-twice-parents/pack.js';
import { thinkTwiceParentsPrompts } from '../../src/packs/think-twice-parents/prompts.js';
import { four, prompts as fourPrompts } from '../helpers/four-stage.js';

const SAID = 'הילדה ישבה בחדר ללמוד ואז התחרפנה';
const REPLY = { ok: true, message: 'ומה היא עשתה אז?', evaluation: { slots: { demand: 1 } }, usage: {} };
const RECORD = JSON.stringify({
  beats: [
    { id: 'sat', slot: 'stage1.demand', actor: 'girl', text: 'ישבה בחדר ללמוד', label: 'ישבה ללמוד', camera: true },
    { id: 'flipped', slot: 'stage1.child_behavior', actor: 'girl', text: 'התחרפנה', label: 'התחרפנה', camera: false },
  ],
  actors: [{ id: 'girl', label: 'הילדה', role: 'הבת', relation: 'הבת שלך', clear: true, actions: [] }],
});

function turnWith(registrarReply) {
  const complete = async (req) => (req.mode === 'registrar' ? registrarReply : REPLY);
  const interview = createEngine({ pack: thinkTwiceParents, prompts: thinkTwiceParentsPrompts, complete });
  return interview.runTurn(interview.createState(), [], SAID);
}

describe('each turn says what the registrar did', () => {
  it('ran, and how many new things it recorded', async () => {
    const r = await turnWith({ ok: true, raw: RECORD, usage: {} });
    expect(r.registrar).toEqual({ ran: true, error: null, added: 3 });
    expect(r.registrarFailure).toBeNull();
  });

  it('ran and had nothing to add — not a failure', async () => {
    const r = await turnWith({ ok: true, raw: '{}', usage: {} });
    expect(r.registrar).toEqual({ ran: true, error: null, added: 0 });
    expect(r.registrarFailure).toBeNull();
  });

  it('a reply that does not parse is a failure, reported without the reply', async () => {
    const r = await turnWith({ ok: true, raw: `{"beats": [{"text": "${SAID}"`, usage: {} });
    expect(r.registrar).toMatchObject({ ran: true, added: 0 });
    expect(r.registrar.error).toMatch(/json/); // cut off before its closing brace: no_json
    expect(r.registrarFailure).toMatchObject({ kind: 'registrar_parse', mode: 'registrar' });
    expect(JSON.stringify(r.registrarFailure)).not.toContain('הילדה');
    // The person's turn still happened.
    expect(r.reply).toBe('ומה היא עשתה אז?');
  });

  it('a failed call passes on the adapter’s own failure', async () => {
    const failure = { kind: 'truncated', status: 200, requestId: 'r1', stage: 1, mode: 'registrar', attempt: 1, detail: 'registrar reply hit max_tokens' };
    const r = await turnWith({ ok: false, error: 'registrar_truncated', failure, usage: {} });
    expect(r.registrar).toMatchObject({ ran: true, error: 'registrar_truncated' });
    expect(r.registrarFailure).toEqual(failure);
  });
});

// router-guard's review of the change.
describe('the edges of it', () => {
  it('an HTTP error shows its kind, never the raw response body', async () => {
    const failure = { kind: 'http', status: 500, requestId: 'r2', stage: 1, mode: 'registrar', attempt: 1, detail: 'overloaded_error' };
    const r = await turnWith({ ok: false, error: '<html>a long upstream page</html>', failure, usage: {} });
    expect(r.registrar.error).toBe('http');
  });

  it('a call that throws is a failure too, with no message of its own', async () => {
    const complete = async (req) => {
      if (req.mode === 'registrar') throw new Error(SAID);
      return REPLY;
    };
    const interview = createEngine({ pack: thinkTwiceParents, prompts: thinkTwiceParentsPrompts, complete });
    const r = await interview.runTurn(interview.createState(), [], SAID);
    expect(r.registrar).toMatchObject({ ran: true, error: 'call_failed' });
    expect(JSON.stringify(r.registrarFailure)).not.toContain('הילדה');
  });

  it('an interview that opts out of the registrar says it did not run', async () => {
    const complete = async () => REPLY;
    const interview = createEngine({ pack: four, prompts: { ...fourPrompts, registrar: null }, complete });
    const r = await interview.runTurn(interview.createState(), [], SAID);
    expect(r.registrar).toEqual({ ran: false, error: null, added: 0 });
  });

  it('a safety stop returns no registrar fields, and neither field enters the state', async () => {
    const complete = async (req) => (req.mode === 'registrar' ? { ok: true, raw: RECORD, usage: {} } : REPLY);
    const interview = createEngine({ pack: thinkTwiceParents, prompts: thinkTwiceParentsPrompts, complete });
    const safety = await interview.runTurn(interview.createState(), [], 'אני רוצה למות');
    expect(safety.registrar).toBeUndefined();
    const r = await interview.runTurn(interview.createState(), [], SAID);
    expect(r.nextState).not.toHaveProperty('registrar');
    expect(r.nextState.meta).not.toHaveProperty('registrar');
    expect(JSON.stringify(r.nextState)).not.toContain('registrarFailure');
  });
});
