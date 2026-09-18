import { describe, it, expect } from 'vitest';
import {
  createEventRecord,
  mergeBeats,
  mergeStances,
  mergeEmotions,
  mergeSetting,
  displayable,
  bySlot,
  isSelf,
  paceScale,
  BEATS_MAX,
  STANCES_MAX,
  EMOTIONS_MAX,
  CONDITIONS_MAX,
} from '../../src/core/eventRecord.js';

const rec = () => createEventRecord();

describe('the ledger refuses what it cannot score', () => {
  it('drops an entity with no slot — it could be neither scored nor display-checked', () => {
    const r = mergeBeats(rec(), [{ id: 'b1', text: 'עברת בסלון' }]);
    expect(r.beats).toEqual({});
  });

  it('drops an entity whose slot is not a stage slot', () => {
    const r = mergeBeats(rec(), [{ id: 'b1', slot: 'trigger', text: 'עברת בסלון' }]);
    expect(r.beats).toEqual({});
  });

  it('drops an entity with no id', () => {
    const r = mergeBeats(rec(), [{ slot: 'stage1.trigger', text: 'עברת בסלון' }]);
    expect(r.beats).toEqual({});
  });

  it('refuses a new entity with no text, and a stance with no type', () => {
    expect(mergeBeats(rec(), [{ id: 'b1', slot: 'stage1.trigger' }]).beats).toEqual({});
    expect(
      mergeStances(rec(), [{ id: 's1', slot: 'stage2.causal', text: 'החליטו בלעדיי' }]).stances,
    ).toEqual({});
  });
});

describe('truth-test fields never default to passed', () => {
  it('a new beat is not camera-verified until the registrar says so', () => {
    const r = mergeBeats(rec(), [{ id: 'b1', slot: 'stage1.trigger', text: 'הוא ירד עליי' }]);
    expect(r.beats.b1.camera).toBe(false);
  });

  it('a new stance is unknown-sourced and not third-person', () => {
    const r = mergeStances(rec(), [
      { id: 's1', slot: 'stage5.perspective', type: 'reading', text: 'היא לא ידעה' },
    ]);
    expect(r.stances.s1.source).toBe('unknown');
    expect(r.stances.s1.thirdPerson).toBe(false);
  });

  it('a new emotion is not granular', () => {
    const r = mergeEmotions(rec(), [{ id: 'e1', slot: 'stage3.emotion', name: 'רע לי' }]);
    expect(r.emotions.e1.granular).toBe(false);
  });

  it('an unrecognised source or stance type is not stored as given', () => {
    const r = mergeStances(rec(), [
      { id: 's1', slot: 'stage2.causal', type: 'reading', text: 'x', source: 'obviously' },
    ]);
    expect(r.stances.s1.source).toBe('unknown');
    expect(mergeStances(rec(), [{ id: 's2', slot: 'stage2.causal', type: 'hunch', text: 'x' }]).stances)
      .toEqual({});
  });
});

describe('deltas keep what they do not mention', () => {
  it('a re-reported beat keeps camera, phase and slot when they are omitted', () => {
    let r = mergeBeats(rec(), [
      { id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון', camera: true, phase: 'during' },
    ]);
    r = mergeBeats(r, [{ id: 'b1', text: 'עברת בסלון ושמעת אותן' }]);
    expect(r.beats.b1).toMatchObject({
      slot: 'stage1.trigger',
      camera: true,
      phase: 'during',
      actor: 'self',
      text: 'עברת בסלון ושמעת אותן',
    });
  });

  it('the ownership test moves only when the registrar re-reports it', () => {
    let r = mergeStances(rec(), [
      { id: 's1', slot: 'stage5.alt_formulation', type: 'reading', text: 'היא רצתה לשתף', source: 'inferred' },
    ]);
    expect(r.stances.s1.source).toBe('inferred');
    r = mergeStances(r, [{ id: 's1', source: 'stated' }]);
    expect(r.stances.s1.source).toBe('stated');
    expect(r.stances.s1.text).toBe('היא רצתה לשתף');
  });

  it('keeps the seq it was first given, so the ledger does not reshuffle', () => {
    let r = mergeBeats(rec(), [{ id: 'a', slot: 'stage1.trigger', text: 'ראשון' }]);
    r = mergeBeats(r, [{ id: 'b', slot: 'stage1.timeline', text: 'שני' }]);
    const firstSeq = r.beats.a.seq;
    r = mergeBeats(r, [{ id: 'a', text: 'ראשון, מתוקן' }]);
    expect(r.beats.a.seq).toBe(firstSeq);
    expect(r.beats.b.seq).toBeGreaterThan(firstSeq);
  });
});

describe('intensity is clamped to the protocol scale', () => {
  it('rounds and clamps into 1..10, and keeps the old value on junk', () => {
    let r = mergeEmotions(rec(), [{ id: 'e1', slot: 'stage3.emotion', name: 'עלבון', intensity: 99 }]);
    expect(r.emotions.e1.intensity).toBe(10);
    r = mergeEmotions(r, [{ id: 'e1', intensity: 'רבה' }]);
    expect(r.emotions.e1.intensity).toBe(10);
    expect(mergeEmotions(rec(), [{ id: 'e2', slot: 'stage3.emotion', name: 'כעס', intensity: 0 }]).emotions.e2.intensity).toBe(1);
  });

  it('is null until measured, so "not asked" is not read as 1', () => {
    const r = mergeEmotions(rec(), [{ id: 'e1', slot: 'stage3.emotion', name: 'עלבון' }]);
    expect(r.emotions.e1.intensity).toBeNull();
  });
});

describe('the display guard — the wound is stored and never drawable', () => {
  // The ledger MUST hold the wound: coverage.stage2.wound cannot reach 2 without
  // the evidence for it. What is forbidden is DRAWING it. Same line `findings`
  // already draws — it stores wound material; only the map stores refuse it.
  it('stores a wound stance', () => {
    const r = mergeStances(rec(), [
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', source: 'stated' },
    ]);
    expect(r.stances.w.text).toBe('אני לא שווה');
  });

  it('but marks it undrawable, along with the ADHD pattern', () => {
    expect(displayable({ slot: 'stage2.wound' })).toBe(false);
    expect(displayable({ slot: 'stage2.adhd_pattern' })).toBe(false);
    expect(displayable({ slot: 'stage2.causal' })).toBe(true);
    expect(displayable({ slot: '' })).toBe(false);
    expect(displayable(undefined)).toBe(false);
  });
});

describe('the setting is corrected, not accumulated', () => {
  it('a delta naming only the place does not erase the time', () => {
    let r = mergeSetting(rec(), { place: 'בסלון', time: 'בערב' });
    r = mergeSetting(r, { place: 'במטבח' });
    expect(r.setting).toMatchObject({ place: 'במטבח', time: 'בערב' });
  });

  it('unions conditions without duplicating them, and caps them', () => {
    let r = mergeSetting(rec(), { conditions: ['גב תפוס', 'אין שותפות'] });
    r = mergeSetting(r, { conditions: ['גב תפוס', 'טירוף מערכות'] });
    expect(r.setting.conditions).toEqual(['גב תפוס', 'אין שותפות', 'טירוף מערכות']);
    r = mergeSetting(r, { conditions: Array.from({ length: 40 }, (_, i) => `c${i}`) });
    expect(r.setting.conditions).toHaveLength(CONDITIONS_MAX);
  });

  it('ignores a non-object report', () => {
    expect(mergeSetting(rec(), null).setting.place).toBe('');
  });
});

describe('backstops bound the ledger without stopping updates', () => {
  it('refuses new entities past the cap but still updates existing ones', () => {
    let r = rec();
    r = mergeBeats(r, Array.from({ length: BEATS_MAX + 10 }, (_, i) => ({
      id: `b${i}`, slot: 'stage1.timeline', text: `פעימה ${i}`,
    })));
    expect(Object.keys(r.beats)).toHaveLength(BEATS_MAX);
    r = mergeBeats(r, [{ id: 'b0', text: 'מתוקן' }]);
    expect(r.beats.b0.text).toBe('מתוקן');
  });

  it('caps stances and emotions too', () => {
    const s = mergeStances(rec(), Array.from({ length: STANCES_MAX + 5 }, (_, i) => ({
      id: `s${i}`, slot: 'stage2.causal', type: 'reading', text: `t${i}`,
    })));
    expect(Object.keys(s.stances)).toHaveLength(STANCES_MAX);
    const e = mergeEmotions(rec(), Array.from({ length: EMOTIONS_MAX + 5 }, (_, i) => ({
      id: `e${i}`, slot: 'stage3.emotion', name: `n${i}`,
    })));
    expect(Object.keys(e.emotions)).toHaveLength(EMOTIONS_MAX);
  });
});

describe('helpers', () => {
  it('bySlot selects the entities feeding one slot', () => {
    const r = mergeBeats(rec(), [
      { id: 'a', slot: 'stage1.trigger', text: 'א' },
      { id: 'b', slot: 'stage1.timeline', text: 'ב' },
    ]);
    expect(bySlot(r.beats, 'stage1.trigger').map((x) => x.id)).toEqual(['a']);
    expect(bySlot(undefined, 'stage1.trigger')).toEqual([]);
  });

  it('isSelf accepts the aliases a model reaches for', () => {
    for (const id of ['self', 'אני', 'המשתמש', 'המרואיין', ' user ']) expect(isSelf(id)).toBe(true);
    expect(isSelf('אשתך')).toBe(false);
    expect(isSelf(undefined)).toBe(false);
  });

  it('paceScale folds the three feeling paces onto the map two clocks', () => {
    expect(paceScale('situational')).toBe('episode');
    expect(paceScale('prior')).toBe('ongoing');
    expect(paceScale('trait')).toBe('ongoing');
  });
});
