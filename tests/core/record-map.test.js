// A drawing made from the registrar's record — both interviews.
//
// Ran, 16.10.2026: "גם אצל ההורים יהיה איור של המאורע". The parents' evaluator
// reports no cubes, so their map draws the registrar's record (pack `map.source:
// 'record'`), the rendering of the ledger Ran ruled on 18.9.2026 ("הגרף מוביל").
// Think Twice followed on 24.10.2026, when Ran ruled that the order of the drawing
// is the order it happened, which only the registrar places. What must hold: the
// record's beats, stances and feelings are drawn, in the time of the incident and
// then the order they were told; "which parent am I" never is; nothing changes for
// a pack that did not ask; and an interview cannot ask for a record map while
// opting out of the registrar.

import { describe, it, expect } from 'vitest';
import { buildMap } from '../../src/core/storyMap.js';
import { applyRegistrar } from '../../src/core/registrar.js';
import { createState } from '../../src/core/state.js';
import { validatePack, mapSource } from '../../src/core/pack.js';
import { createEngine } from '../../src/core/engine.js';
import { thinkTwiceParents as parents } from '../../src/packs/think-twice-parents/pack.js';
import { thinkTwiceAdult as adult } from '../../src/packs/think-twice-adult/pack.js';
import { prompts as fourPrompts } from '../helpers/four-stage.js';

const clone = (v) => JSON.parse(JSON.stringify(v));

// Natali's homework example, invented in its details (docs/parent-app/registrar-model.html).
const DELTAS = {
  actors: [
    { id: 'self', label: 'את/ה', role: 'ההורה', relation: '', clear: true },
    { id: 'yoav', label: 'יואב', role: 'הילד, בן 10', relation: 'הבן', clear: true },
  ],
  beats: [
    { id: 'asked', slot: 'stage1.demand', actor: 'self', text: 'ביקשת שיתחיל שיעורי בית בשש', label: 'ביקשת להתחיל', camera: true, scale: 'episode' },
    { id: 'threw', slot: 'stage1.child_behavior', actor: 'yoav', text: 'זרק את המחברת', label: 'זרק את המחברת', camera: true, scale: 'episode' },
    { id: 'shouted', slot: 'stage1.parent_response', actor: 'self', text: 'צעקת ושלחת אותו לחדר', label: 'צעקת', camera: true, scale: 'episode' },
  ],
  stances: [
    { id: 'dodging', slot: 'stage5.parent_thought_then', type: 'reading', actor: 'self', text: 'חשבת שהוא מתחמק', label: 'הוא מתחמק', source: 'stated', scale: 'episode' },
    { id: 'bad_parent', slot: 'stage5.parent_self', type: 'reading', actor: 'self', text: 'אמרת שאת אמא גרועה', label: 'אמא גרועה', source: 'stated', scale: 'ongoing' },
  ],
  emotions: [
    { id: 'flooded', slot: 'stage4.child_feeling', actor: 'yoav', name: 'מוצף', label: 'מוצף', source: 'attributed', granular: true },
  ],
  edges: [
    { from: 'beat:asked', to: 'beat:threw', kind: 'then', confirmed: true },
    { from: 'beat:threw', to: 'beat:shouted', kind: 'then', confirmed: true },
  ],
};

const COVERAGE = {
  stage1: { demand: 2, child_behavior: 2, parent_response: 2, ending: 1 },
  stage4: { child_feeling: 1 },
  stage5: { parent_thought_then: 1, parent_self: 2 },
};

function withRecord(pack) {
  const s = createState(pack);
  const covered = { ...s, coverage: { ...s.coverage } };
  for (const [stage, slots] of Object.entries(COVERAGE)) {
    covered.coverage[stage] = { ...covered.coverage[stage], ...slots };
  }
  return applyRegistrar(covered, DELTAS, 1, pack);
}

describe('the parents’ map draws the registrar’s record', () => {
  it('asks for it in the pack, and the pack is valid', () => {
    expect(mapSource(parents)).toBe('record');
    expect(mapSource(adult)).toBe('record');
    expect(validatePack(parents).ok).toBe(true);
  });

  it('draws the event in the order the parent related, and the meaning beside it', () => {
    const map = buildMap(withRecord(parents), parents);
    const labels = map.stations.map((n) => n.label);
    expect(labels.indexOf('ביקשת להתחיל')).toBeLessThan(labels.indexOf('זרק את המחברת'));
    expect(labels.indexOf('זרק את המחברת')).toBeLessThan(labels.indexOf('צעקת'));
    expect(labels).toContain('הוא מתחמק');
    expect(labels).toContain('מוצף');
    expect(map.cast.map((a) => a.label)).toEqual(expect.arrayContaining(['יואב']));
    expect(map.isEmpty).toBe(false);
  });

  it('puts each cube in its column by the slot’s kind', () => {
    const map = buildMap(withRecord(parents), parents);
    const kindOf = (label) => map.stations.find((n) => n.label === label)?.kind;
    expect(kindOf('זרק את המחברת')).toBe('fact');
    expect(kindOf('צעקת')).toBe('action');
    expect(kindOf('הוא מתחמק')).toBe('thought');
    expect(kindOf('מוצף')).toBe('feeling');
  });

  it('never draws "which parent am I", though the record keeps it', () => {
    const state = withRecord(parents);
    expect(Object.values(state.eventRecord.stances).map((s) => s.slot)).toContain('stage5.parent_self');
    const map = buildMap(state, parents);
    const drawn = JSON.stringify(map);
    expect(drawn).not.toContain('אמא גרועה');
    expect(drawn).not.toContain('parent_self');
  });

  it('draws nothing the interviewer has not yet scored', () => {
    const state = withRecord(parents);
    const unscored = { ...state, coverage: { ...state.coverage, stage4: { ...state.coverage.stage4, child_feeling: 0 } } };
    expect(buildMap(unscored, parents).stations.map((n) => n.label)).not.toContain('מוצף');
  });
});

describe('the Think Twice drawing is the record too (Ran, 24.10.2026)', () => {
  it('draws what the registrar wrote down, once the interviewer has scored its slot', () => {
    const state = applyRegistrar(createState(adult), {
      beats: [{ id: 'arrived', slot: 'stage1.trigger', actor: 'self', text: 'הבשר הגיע', label: 'הבשר הגיע', camera: true }],
    }, 1, adult);
    const covered = { ...state, coverage: { ...state.coverage, stage1: { ...state.coverage.stage1, trigger: 2 } } };
    expect(buildMap(covered, adult).stations.map((n) => n.id)).toContain('beat:arrived');
  });

  it('no longer draws the cubes the interviewer reports in its own turn', () => {
    const s = createState(adult);
    const reported = {
      ...s,
      nodes: { 'stage1.trigger': { id: 'stage1.trigger', label: 'מדווח', slot: 'stage1.trigger', scale: 'episode', seq: 1 } },
      coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 2 } },
    };
    expect(JSON.stringify(buildMap(reported, adult))).not.toContain('מדווח');
  });
});

describe('the contract', () => {
  it('refuses a map source the engine does not know', () => {
    const p = clone(parents);
    p.map.source = 'records';
    expect(validatePack(p).errors.join(' | ')).toContain('map.source must be one of reported, record');
  });

  it('refuses a record map in an interview that opts out of the registrar', () => {
    const pack = { ...clone(parents) };
    const texts = { ...fourPrompts, registrar: null, stages: Object.fromEntries(pack.stages.map((s) => [s.key, `[${s.key}]`])) };
    expect(() => createEngine({ pack, prompts: texts, complete: async () => ({ ok: true }) })).toThrow(/record/);
  });
});

// router-guard's review of 16.10.2026.
describe('what the drawing never claims', () => {
  it('does not draw what the interviewer offered until the parent takes it up', () => {
    const offered = {
      stances: [{ id: 'trait', slot: 'stage3.trait_link', type: 'reading', actor: 'self', text: 'קשה לו להתחיל משימה גדולה', label: 'קשה להתחיל', source: 'inferred', scale: 'ongoing' }],
    };
    const covered = (s) => ({ ...s, coverage: { ...s.coverage, stage3: { ...s.coverage.stage3, trait_link: 2 } } });
    const before = covered(applyRegistrar(withRecord(parents), offered, 2, parents));
    expect(JSON.stringify(buildMap(before, parents))).not.toContain('קשה להתחיל');
    const adopted = covered(applyRegistrar(before, { stances: [{ id: 'trait', source: 'stated' }] }, 3, parents));
    expect(JSON.stringify(buildMap(adopted, parents))).toContain('קשה להתחיל');
  });

  it('draws the ending after the parent’s response, with no edge into the ending', () => {
    const ended = applyRegistrar(withRecord(parents), {
      beats: [{ id: 'cried', slot: 'stage1.ending', actor: 'yoav', text: 'בכה בחדר', label: 'בכה בחדר', camera: true, scale: 'episode' }],
    }, 2, parents);
    const labels = buildMap(ended, parents).stations.map((n) => n.label);
    expect(labels.indexOf('צעקת')).toBeLessThan(labels.indexOf('בכה בחדר'));
  });

  it('never draws a character word about the child as a cube of its own', () => {
    const s = createState(parents);
    const state = {
      ...s,
      coverage: { ...s.coverage, stage2: { ...s.coverage.stage2, behavior_label: 1 } },
      findings: { ...s.findings, stage2: { behavior_label: ['מפונק'] } },
    };
    expect(JSON.stringify(buildMap(state, parents))).not.toContain('מפונק');
  });
});

describe('any pack with a record map keeps its own barred slots off it', () => {
  it('the four-stage pack, whose barred slot is not named parent_self', async () => {
    const { four } = await import('../helpers/four-stage.js');
    const pack = { ...clone(four), map: { ...(clone(four).map ?? {}), source: 'record' } };
    expect(validatePack(pack).ok).toBe(true);
    const barredKey = pack.stages.find((st) => st.slots.some((x) => x.barred));
    const slot = barredKey.slots.find((x) => x.barred).id;
    const s = createState(pack);
    const state = applyRegistrar(
      { ...s, coverage: { ...s.coverage, [barredKey.key]: { ...s.coverage[barredKey.key], [slot]: 2 } } },
      { stances: [{ id: 'hurt', slot: `${barredKey.key}.${slot}`, type: 'reading', actor: 'self', text: 'משהו שנאמר', label: 'הפצע', source: 'stated' }] },
      1,
      pack
    );
    expect(Object.keys(state.eventRecord.stances)).toContain('hurt');
    expect(JSON.stringify(buildMap(state, pack))).not.toContain('הפצע');
  });
});

// Ran, 24.10.2026: "the announcement is drawn before the preparation it came after".
// The order of the story is the order it happened, from what the registrar wrote.
describe('the order of the story is the order it happened', () => {
  const ORDERED = {
    beats: [
      // Told first, but it came after the preparation: the registrar places it during.
      { id: 'announce', slot: 'stage1.trigger', actor: 'self', text: 'אשתך הודיעה על 20:30', label: 'הודעה 20:30', camera: true, phase: 'during' },
      { id: 'prep', slot: 'stage1.timeline', actor: 'self', text: 'התארגנו לארוחה', label: 'התארגנות לארוחה', camera: true, phase: 'before' },
    ],
  };
  const scored = (s) => ({
    ...s,
    coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 2, timeline: 2 } },
  });

  it('draws the preparation before the announcement, by the time it happened', () => {
    const state = scored(applyRegistrar(createState(adult), ORDERED, 1, adult));
    expect(buildMap(state, adult).stations.map((n) => n.label)).toEqual(['התארגנות לארוחה', 'הודעה 20:30']);
  });

  it('keeps that order when the registrar placed both in the same time, through the confirmed then', () => {
    const delta = {
      beats: ORDERED.beats.map((b) => ({ ...b, phase: '' })),
      edges: [{ from: 'beat:prep', to: 'beat:announce', kind: 'then', confirmed: true }],
    };
    const state = scored(applyRegistrar(createState(adult), delta, 1, adult));
    expect(buildMap(state, adult).stations.map((n) => n.label)).toEqual(['התארגנות לארוחה', 'הודעה 20:30']);
  });

  // router-guard, 24.10.2026: the same-slot chain constrained siblings by the order
  // they were told and ignored the time the registrar gave them.
  it('two beats in one slot keep the time order, not the told order', () => {
    const sameSlot = {
      beats: ORDERED.beats.map((b) => ({ ...b, slot: 'stage1.trigger' })),
    };
    const state = scored(applyRegistrar(createState(adult), sameSlot, 1, adult));
    expect(buildMap(state, adult).stations.map((n) => n.label)).toEqual(['התארגנות לארוחה', 'הודעה 20:30']);
  });

  it('a feeling told between two beats is drawn between them, in the body of the incident', () => {
    let state = applyRegistrar(createState(adult), { beats: [ORDERED.beats[1]] }, 1, adult); // prep, before
    state = applyRegistrar(state, { emotions: [{ id: 'dread', slot: 'stage3.emotion', actor: 'self', name: 'חרדה', label: 'חרדה', granular: true, source: 'stated' }] }, 2, adult);
    state = applyRegistrar(state, { beats: [ORDERED.beats[0]] }, 3, adult); // announce, during
    state = applyRegistrar(state, { beats: [{ id: 'left', slot: 'stage1.auto_reaction', actor: 'self', text: 'יצאת', label: 'יצאת', camera: true, phase: 'during' }] }, 4, adult);
    state = scored(state);
    state = {
      ...state,
      coverage: {
        ...state.coverage,
        stage1: { ...state.coverage.stage1, auto_reaction: 2 },
        stage3: { ...state.coverage.stage3, emotion: 2 },
      },
    };
    expect(buildMap(state, adult).stations.map((n) => n.label)).toEqual(['התארגנות לארוחה', 'חרדה', 'הודעה 20:30', 'יצאת']);
  });

  it("a slot's fallback cube follows the placed beats instead of jumping ahead of them", () => {
    let state = scored(applyRegistrar(createState(adult), ORDERED, 1, adult));
    // stage2.causal scored, with a label but nothing in the record for it.
    state = {
      ...state,
      coverage: { ...state.coverage, stage2: { ...state.coverage.stage2, causal: 2 } },
      mapLabels: { ...state.mapLabels, stage2: { ...(state.mapLabels?.stage2 ?? {}), causal: 'כי לחצו עליו' } },
    };
    const labels = buildMap(state, adult).stations.map((n) => n.label);
    expect(labels).toEqual(['התארגנות לארוחה', 'הודעה 20:30', 'כי לחצו עליו']);
  });

  it('the ground lane keeps the narrative order: a standing state told later is not "after"', () => {
    let state = applyRegistrar(createState(adult), {
      stances: [{ id: 'not_pro', slot: 'stage2.meaning', type: 'reading', actor: 'self', text: 'לא מקצועי', label: 'לא מקצועי', source: 'stated', scale: 'ongoing' }],
    }, 1, adult);
    state = applyRegistrar(state, {
      stances: [{ id: 'pressure', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'המטבח בלחץ', label: 'המטבח בלחץ', source: 'stated', scale: 'ongoing' }],
    }, 2, adult);
    state = { ...state, coverage: { ...state.coverage, stage2: { ...state.coverage.stage2, causal: 2, meaning: 2 } } };
    // causal precedes meaning in the narrative, though meaning was told first.
    expect(buildMap(state, adult).ground.map((n) => n.label)).toEqual(['המטבח בלחץ', 'לא מקצועי']);
  });
});
