import { describe, it, expect } from 'vitest';
import {
  createState,
  appendDecisionLog,
  DECISION_LOG_MAX,
  addFindings,
  FINDINGS_PER_SLOT_MAX,
  mergeActorMap,
  deriveActorsScore,
  hasUnclearActor,
} from '../../src/core/state.js';

describe('appendDecisionLog', () => {
  it('appends to an empty/undefined log', () => {
    expect(appendDecisionLog(undefined, { decision: 'stay' })).toEqual([{ decision: 'stay' }]);
  });

  it('keeps only the last DECISION_LOG_MAX entries', () => {
    let log = [];
    for (let i = 0; i < DECISION_LOG_MAX + 5; i++) {
      log = appendDecisionLog(log, { decision: 'stay', n: i });
    }
    expect(log.length).toBe(DECISION_LOG_MAX);
    // Oldest dropped — first remaining entry is index 5.
    expect(log[0].n).toBe(5);
    expect(log[log.length - 1].n).toBe(DECISION_LOG_MAX + 4);
  });

  it('does not mutate the input array', () => {
    const original = [{ decision: 'stay' }];
    appendDecisionLog(original, { decision: 'advance' });
    expect(original).toEqual([{ decision: 'stay' }]);
  });
});

describe('createState', () => {
  it('starts with an empty decision log', () => {
    expect(createState().meta.decisionLog).toEqual([]);
  });

  it('starts with an empty findings map', () => {
    expect(createState().findings).toEqual({});
  });
});

describe('addFindings', () => {
  it('appends trimmed, non-empty items under stage.slot', () => {
    const s = addFindings(createState(), 'stage1', 'timeline', ['  האירוע בערב ', '', 'לארגן את הבית']);
    expect(s.findings.stage1.timeline).toEqual(['האירוע בערב', 'לארגן את הבית']);
  });

  it('accumulates across calls and dedupes', () => {
    let s = addFindings(createState(), 'stage1', 'actors', ['אתה', 'אשתך']);
    s = addFindings(s, 'stage1', 'actors', ['אשתך', 'רומי']);
    expect(s.findings.stage1.actors).toEqual(['אתה', 'אשתך', 'רומי']);
  });

  it('returns the same state object when nothing new is added', () => {
    const s1 = addFindings(createState(), 'stage1', 'timeline', ['א']);
    const s2 = addFindings(s1, 'stage1', 'timeline', ['א']); // duplicate only
    expect(s2).toBe(s1);
  });

  it('ignores empty / non-array input', () => {
    const base = createState();
    expect(addFindings(base, 'stage1', 'timeline', [])).toBe(base);
    expect(addFindings(base, 'stage1', 'timeline', 'nope')).toBe(base);
  });

  it('does not mutate the input state', () => {
    const base = createState();
    addFindings(base, 'stage1', 'timeline', ['א']);
    expect(base.findings).toEqual({});
  });

  it('caps at FINDINGS_PER_SLOT_MAX, keeping the most recent', () => {
    let s = createState();
    for (let i = 0; i < FINDINGS_PER_SLOT_MAX + 3; i++) {
      s = addFindings(s, 'stage1', 'timeline', [`item-${i}`]);
    }
    const list = s.findings.stage1.timeline;
    expect(list.length).toBe(FINDINGS_PER_SLOT_MAX);
    expect(list[0]).toBe('item-3'); // earliest three dropped
    expect(list[list.length - 1]).toBe(`item-${FINDINGS_PER_SLOT_MAX + 2}`);
  });
});

describe('actor map', () => {
  it('mergeActorMap adds new actors by id, keeping existing ones', () => {
    let s = mergeActorMap(createState(), [
      { id: 'user', label: 'המשתמש', role: 'המספר', relation: 'עצמו', clear: true },
    ]);
    s = mergeActorMap(s, [{ id: 'romi', label: 'רומי', role: 'הבת הגדולה', relation: 'בת', clear: true }]);
    expect(Object.keys(s.actorMap)).toEqual(['user', 'romi']);
    expect(s.actorMap.user.role).toBe('המספר'); // earlier actor untouched
  });

  it('mergeActorMap appends new actions to an existing actor (deduped), trimming empties', () => {
    let s = mergeActorMap(createState(), [
      { id: 'sister', label: 'נורית', clear: true, actions: [' לא הגיעה ', ''] },
    ]);
    s = mergeActorMap(s, [{ id: 'sister', label: 'נורית', actions: ['לא הגיעה', 'ניתקה טלפון'] }]);
    expect(s.actorMap.sister.actions).toEqual(['לא הגיעה', 'ניתקה טלפון']);
  });

  it('mergeActorMap: clear=null keeps the prior value; a boolean updates it', () => {
    let s = mergeActorMap(createState(), [{ id: 'father', label: 'אבא', clear: false }]);
    s = mergeActorMap(s, [{ id: 'father', label: 'אבא', clear: null, actions: ['x'] }]);
    expect(s.actorMap.father.clear).toBe(false); // kept across a delta without clear
    s = mergeActorMap(s, [{ id: 'father', label: 'אבא', clear: true }]);
    expect(s.actorMap.father.clear).toBe(true); // updated when provided
  });

  it('mergeActorMap defaults a brand-new actor to clear when unspecified', () => {
    const s = mergeActorMap(createState(), [{ id: 'x', label: 'דמות', clear: null }]);
    expect(s.actorMap.x.clear).toBe(true);
  });

  it('mergeActorMap does not mutate the input state', () => {
    const base = createState();
    mergeActorMap(base, [{ id: 'x', label: 'דמות' }]);
    expect(base.actorMap).toEqual({});
  });

  it('deriveActorsScore: empty→0, all clear→2, any unclear→1', () => {
    expect(deriveActorsScore({})).toBe(0);
    expect(deriveActorsScore({ a: { clear: true }, b: { clear: true } })).toBe(2);
    expect(deriveActorsScore({ a: { clear: true }, b: { clear: false } })).toBe(1);
  });

  it('hasUnclearActor flags only an explicit clear:false', () => {
    expect(hasUnclearActor({})).toBe(false);
    expect(hasUnclearActor({ a: { clear: true } })).toBe(false);
    expect(hasUnclearActor({ a: { clear: true }, b: { clear: false } })).toBe(true);
  });
});
