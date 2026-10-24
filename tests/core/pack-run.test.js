// A whole interview on a pack that is not Think Twice.
//
// Phase 1, slice 3 (10.10.2026): the turn loop used to be written for Think Twice's
// seven stages — slot references by /^stage([1-7])\./, the cast merged and scored
// only in stage 1 as `actors`, the board and the close written into stage 7,
// intensity measured in stages 3 and 5, the wound and the ADHD pattern barred by
// name in a constant. validatePack refused to run any other shape. This file is the
// proof that it no longer has to: four stages, the cast gated on stage 2 under
// another slot name, intensity measured in stages 2 and 3, the decision on stage 4,
// and a barred slot called neither `wound` nor `adhd_pattern` — run from the first
// turn to a closed session through createEngine, the way a shell runs one.
//
// The barred slot is the part that matters most. Its failure is not a crash, it is
// the hidden material drawn on the person's screen, so every path that could leak
// it is walked: the display stores, the map, the redacted account the summary and
// the opener are written from — and the full account the probe needs, where it must
// still be.

import { describe, it, expect, beforeAll } from 'vitest';
import { createEngine } from '../../src/core/engine.js';
import { validatePack } from '../../src/core/pack.js';
import { Decision } from '../../src/core/router.js';
import { four, prompts } from '../helpers/four-stage.js';

// The hidden material, in words that cannot turn up anywhere by accident.
const HURT_TEXT = 'אני לא שווה כלום';
const HURT_LABEL = 'פגיעה עמוקה';

// A scripted model. Each turn sets what the registrar and the probe report; the
// summary, the opener and the board answer the same way every time.
const calls = [];
let next = { registrar: {}, probe: {} };
const complete = async (req) => {
  const p = req.systemPrompt;
  const sys = typeof p === 'string' ? p : `${p.stable}\n${p.volatile}`;
  calls.push({ mode: req.mode ?? 'probe', stage: req.stage, sys });
  switch (req.mode) {
    case 'registrar':
      return { ok: true, raw: JSON.stringify(next.registrar) };
    case 'summary':
      return { ok: true, message: 'בוא נוודא שהבנתי נכון — זה מדויק?' };
    case 'opener':
      return { ok: true, message: 'נמשיך מכאן. מה עוד חשוב?' };
    case 'board':
      return { ok: true, message: 'הנה מה שאספנו.', evaluation: { board: [{ option: 'לדבר איתו' }] } };
    default:
      return { ok: true, message: 'ומה קרה אז?', evaluation: { slots: {}, ...next.probe } };
  }
};

describe('a four-stage interview runs from the first turn to a close', () => {
  const interview = createEngine({ pack: four, prompts, complete });
  let state;
  let history = [];
  const log = [];
  let heldOnCast; // the state after the turn the muddled cast held stage 2

  const turn = async (text, script) => {
    next = { registrar: {}, probe: {}, ...script };
    const r = await interview.runTurn(state, history, text);
    state = r.nextState;
    history = [...history, { role: 'user', content: text }, { role: 'assistant', content: r.reply }];
    log.push(r.decision);
    return r;
  };
  const lastCall = (mode) => calls.filter((c) => c.mode === mode).at(-1);

  beforeAll(async () => {
    state = interview.createState();

    // Stage 1 — the registrar records a beat, the hidden hurt and a muddled cast;
    // the probe tries to put the hurt on the map by every route it has.
    await turn('נפגשנו במשרד והוא צעק עליי', {
      registrar: {
        beats: [
          { id: 'met', slot: 'stage1.event', actor: 'self', text: 'נפגשתם במשרד', label: 'הפגישה' },
          // Stage 6 of a four-stage interview names nothing — it is not stored.
          { id: 'ghost', slot: 'stage6.event', actor: 'self', text: 'משהו אחר', label: 'אחר' },
        ],
        stances: [{ id: 'hurt', slot: 'stage2.hidden_hurt', type: 'reading', actor: 'self', text: HURT_TEXT, label: HURT_LABEL, source: 'stated' }],
        actors: [{ id: 'boss', label: 'המנהל', clear: false }],
        edges: [{ from: 'stage2.hidden_hurt', to: 'stage1.when', kind: 'because', confirmed: true }],
        groups: [{ id: 'ground', label: 'ברקע', kind: 'community', members: ['stage2.hidden_hurt', 'stage1.event', 'stage1.when'], confirmed: true }],
      },
      probe: {
        slots: { event: 2, when: 2, 'stage2.reading': 1 },
        emotionIntensity: 9, // no intensity component on stage 1 — not recorded
        mapLabels: { event: 'צעקה', when: 'בבוקר', 'stage2.hidden_hurt': HURT_LABEL },
        nodes: [
          { id: 'shout', label: 'צעקה', slot: 'stage1.event' },
          { id: 'hurt_cube', label: HURT_LABEL, slot: 'stage2.hidden_hurt' },
        ],
        edges: [
          { from: 'stage2.hidden_hurt', to: 'shout', kind: 'because', confirmed: true },
          { from: 'stage2.reading', to: 'shout', kind: 'about', confirmed: true },
          { from: 'shout', to: 'stage1.when', kind: 'about', confirmed: true },
        ],
        groups: [{ id: 'office', label: 'המשרד', kind: 'process', members: ['shout', 'stage2.hidden_hurt', 'stage1.when'], confirmed: true }],
      },
    });

    // Stage 2 — the cast is unclear, so the stage holds; then it clears.
    await turn('אני לא בטוח מי עוד היה שם', {
      probe: {
        slots: { people: 2, reading: 2, hidden_hurt: 2 },
        actorMap: [{ id: 'boss', label: 'המנהל', clear: false }],
        emotionIntensity: 7,
      },
    });
    heldOnCast = state;
    await turn('רק הוא, ואני', { probe: { actorMap: [{ id: 'boss', label: 'המנהל', clear: true }] } });

    // Stage 3 — the collector.
    await turn('אפשר לדבר איתו או לחכות', {
      probe: { slots: { options: 2 }, alternatives: ['לדבר איתו', 'לחכות'], emotionIntensity: 4 },
    });

    // Stage 4 — the board, a real either-or that re-opens the collector, and back.
    await turn('אני רוצה שזה ייפתר', { probe: { slots: { goal: 1 } } });
    await turn('אולי גם וגם — לדבר איתו מחר וגם לכתוב לו', { probe: { mergeAttempt: 'real' } });
    await turn('כן, זה מה שאני רוצה להוסיף', { probe: { alternatives: ['לכתוב לו מחר'] } });
    await turn('המטרה שלי ברורה', { probe: { slots: { goal: 2 } } });
    await turn('אני אדבר איתו מחר בבוקר', {
      probe: { slots: { sharp_decision: 2, package_test: 2 }, decisionType: 'sharp', decision: { choice: 'לדבר איתו' } },
    });
  });

  it('is a pack this engine accepts', () => {
    expect(validatePack(four)).toEqual({ ok: true, errors: [], limits: [] });
  });

  it('walks the Router through every stage and closes on the fourth', () => {
    expect(log).toEqual([
      Decision.REQUEST_CONFIRMATION, // stage 1 complete
      Decision.STAY, // stage 2 held on the muddled cast
      Decision.REQUEST_CONFIRMATION, // stage 2 complete once the cast is clear
      Decision.REQUEST_CONFIRMATION, // stage 3 complete
      Decision.SHOW_BOARD, // stage 4: the board, as soon as the goal is known
      Decision.REOPEN, // a real either-or goes back to the collector
      Decision.REQUEST_CONFIRMATION, // stage 3 again
      Decision.SHOW_BOARD, // the board again, on the new basket
      Decision.SESSION_COMPLETE,
    ]);
    expect(state.meta.sessionComplete).toBe(true);
    expect(state.meta.currentStage).toBe(4);
  });

  it('gates and scores the cast where the pack put it', () => {
    // The model said 2; the code derived 1 from a cast with an unclear character,
    // and the stage held on it. Once the cast cleared, the score followed.
    expect(heldOnCast.coverage.stage2.people).toBe(1);
    expect(heldOnCast.meta.currentStage).toBe(2);
    expect(state.coverage.stage2.people).toBe(2);
    // Nothing is written where Think Twice keeps its cast.
    expect(state.coverage.stage1).toEqual({ event: 2, when: 2 });
  });

  it('routes a cross-stage report into the stage it names', () => {
    // "stage2.reading" was reported in stage 1 and pre-seeded to 1; stage 2 took it to 2.
    expect(state.coverage.stage2.reading).toBe(2);
    // And a reference past the last stage is no reference at all.
    expect(state.eventRecord.beats.met).toBeDefined();
    expect(state.eventRecord.beats.ghost).toBeUndefined();
  });

  it('measures intensity only on the stages that carry the component', () => {
    expect(state.meta.kpi.emotionIntensityStage2).toBe(7);
    expect(state.meta.kpi.emotionIntensityStage3).toBe(4);
    expect(Object.keys(state.meta.kpi).filter((k) => k.startsWith('emotionIntensity'))).toEqual([
      'emotionIntensityStage2',
      'emotionIntensityStage3',
    ]);
  });

  it('shows the board and closes on the decision stage, whatever its number', () => {
    expect(calls.filter((c) => c.mode === 'board').map((c) => c.stage)).toEqual([4, 4]);
    expect(state.coverage.stage4.board_presented).toBe(2);
    expect(state.meta.kpi.questionsPerStage.stage4).toBeGreaterThan(0);
    expect(state.coverage.stage7).toBeUndefined();
    expect(state.basket.map((b) => b.text)).toEqual(['לדבר איתו', 'לחכות', 'לכתוב לו מחר']);
  });

  it('frames the re-open with the collector’s own number', () => {
    const reopen = calls.find((c) => c.mode === 'opener' && c.sys.includes('חזרה לשלב החלופות'));
    expect(reopen.sys).toContain('חזרה לשלב החלופות (3)');
    expect(reopen.stage).toBe(3);
  });

  it('puts each stage’s own agent in the probe', () => {
    const stagesProbed = new Set(calls.filter((c) => c.mode === 'probe').map((c) => c.stage));
    expect([...stagesProbed].sort()).toEqual([1, 2, 3, 4]);
    for (const c of calls.filter((x) => x.mode === 'probe')) expect(c.sys).toContain(`[stage${c.stage}]`);
  });

  describe('the barred slot is the pack’s, under any name', () => {
    it('keeps it for the Router and the probe', () => {
      expect(state.coverage.stage2.hidden_hurt).toBe(2);
      expect(state.eventRecord.stances.hurt.text).toBe(HURT_TEXT);
      expect(interview.renderEvent(state, { full: true })).toContain(HURT_TEXT);
      expect(calls.filter((c) => c.mode === 'probe').at(-1).sys).toContain(HURT_TEXT);
    });

    it('refuses it at every display store', () => {
      expect(state.mapLabels.stage2?.hidden_hurt).toBeUndefined();
      expect(Object.values(state.nodes).map((n) => n.slot)).not.toContain('stage2.hidden_hurt');
      expect(Object.keys(state.edges).some((id) => id.includes('hidden_hurt'))).toBe(false);
      expect(state.groups.office.members).toEqual(['shout', 'stage1.when']);
      expect(state.groups.ground.members).toEqual(['stage1.event', 'stage1.when']);
      expect(JSON.stringify([state.mapLabels, state.nodes, state.edges, state.groups])).not.toContain(HURT_LABEL);
    });

    it('never draws it on the map', () => {
      expect(JSON.stringify(interview.buildMap(state))).not.toContain(HURT_LABEL);
    });

    it('never recites it — not in the account, the summary, the opener or the board', () => {
      expect(interview.renderEvent(state)).not.toContain(HURT_TEXT);
      for (const mode of ['summary', 'opener', 'board']) {
        const spoken = calls.filter((c) => c.mode === mode);
        expect(spoken.length).toBeGreaterThan(0);
        for (const c of spoken) expect(c.sys, mode).not.toContain(HURT_TEXT);
      }
    });
  });

  it('lets only the pack’s minds be about something', () => {
    expect(state.edges['stage2.reading→shout']).toMatchObject({ kind: 'about' });
    // A beat is not a mind in this pack, so its `about` was refused, not flipped.
    expect(state.edges['shout→stage1.when']).toBeUndefined();
  });

  it('draws the map in the pack’s narrative, and turns it into a journey on its timeline', () => {
    const map = interview.buildMap(state);
    expect(map.form).toBe('journey');
    expect(map.stations.find((n) => n.id === 'shout')).toMatchObject({ kind: 'fact' });
  });
});
