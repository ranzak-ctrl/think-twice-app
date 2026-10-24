import { describe, it, expect } from 'vitest';
import { createEventRecord, mergeBeats, mergeStances, mergeEmotions, mergeSetting } from '../../src/core/eventRecord.js';
import { nodesFromRecord, trimLabel, endpointFor } from '../../src/core/eventMap.js';

const withRecord = (r) => ({ eventRecord: r });

describe('nodesFromRecord — the map becomes a rendering of the ledger', () => {
  it('returns nothing without a record or with an empty one', () => {
    expect(nodesFromRecord({})).toEqual({});
    expect(nodesFromRecord(withRecord(createEventRecord()))).toEqual({});
  });

  it('emits the shape state.nodes holds, so the switch is one line (and the phase the time order uses)', () => {
    const r = mergeBeats(createEventRecord(), [
      { id: 'b1', slot: 'stage1.trigger', text: 'עברת בסלון', label: 'עברת בסלון' },
    ]);
    expect(nodesFromRecord(withRecord(r))['beat:b1']).toEqual({
      id: 'beat:b1', label: 'עברת בסלון', slot: 'stage1.trigger', scale: 'episode', seq: 1, phase: '',
    });
  });

  it('draws beats, stances and emotions — and never the setting', () => {
    let r = mergeSetting(createEventRecord(), { place: 'בסלון', conditions: ['גב תפוס'] });
    r = mergeBeats(r, [{ id: 'b', slot: 'stage1.trigger', text: 'עברת', label: 'עברת' }]);
    r = mergeStances(r, [{ id: 's', slot: 'stage2.causal', type: 'reading', text: 'בלעדיי', label: 'בלעדיי', source: 'stated' }]);
    r = mergeEmotions(r, [{ id: 'e', slot: 'stage3.emotion', name: 'עלבון', label: 'עלבון', source: 'stated' }]);
    const ids = Object.keys(nodesFromRecord(withRecord(r)));
    expect(ids).toEqual(['beat:b', 'stance:s', 'emotion:e']);
    expect(JSON.stringify(nodesFromRecord(withRecord(r)))).not.toContain('בסלון');
  });

  // router-guard, 24.10.2026: within one phase every beat preceded every stance,
  // which preceded every emotion, because seq counted per kind.
  it('lays the kinds in the order they were told, not beats first', () => {
    let r = mergeEmotions(createEventRecord(), [{ id: 'dread', slot: 'stage3.emotion', name: 'חרדה', label: 'חרדה', source: 'stated' }]);
    r = mergeBeats(r, [{ id: 'arrived', slot: 'stage1.trigger', text: 'הבשר הגיע', label: 'הבשר הגיע' }]);
    r = mergeStances(r, [{ id: 'show', slot: 'stage2.causal', type: 'reading', text: 'רצה להראות', label: 'רצה להראות', source: 'stated' }]);
    r = mergeBeats(r, [{ id: 'remark', slot: 'stage1.timeline', text: 'ההערה', label: 'ההערה' }]);
    expect(Object.keys(nodesFromRecord(withRecord(r)))).toEqual(['emotion:dread', 'beat:arrived', 'stance:show', 'beat:remark']);
    expect(Object.values(nodesFromRecord(withRecord(r))).map((n) => n.seq)).toEqual([1, 2, 3, 4]);
  });

  it('keeps the told order through a re-report of the same id', () => {
    let r = mergeBeats(createEventRecord(), [{ id: 'a', slot: 'stage1.trigger', text: 'א', label: 'א' }]);
    r = mergeStances(r, [{ id: 's', slot: 'stage2.causal', type: 'reading', text: 'ס', label: 'ס', source: 'stated' }]);
    r = mergeBeats(r, [{ id: 'a', slot: 'stage1.trigger', text: 'א מתוקן', label: 'א מתוקן' }]);
    expect(Object.keys(nodesFromRecord(withRecord(r)))).toEqual(['beat:a', 'stance:s']);
    expect(r.beats.a.told).toBe(1);
  });

  it('an entry from before `told` existed keeps the front, in block order', () => {
    const r = createEventRecord();
    r.stances.old = { id: 'old', slot: 'stage2.causal', type: 'reading', text: 'ישן', label: 'ישן', source: 'stated', seq: 1 };
    r.beats.older = { id: 'older', slot: 'stage1.trigger', text: 'ישן יותר', label: 'ישן יותר', seq: 1 };
    const stamped = mergeEmotions(r, [{ id: 'new', slot: 'stage3.emotion', name: 'חדש', label: 'חדש', source: 'stated' }]);
    expect(Object.keys(nodesFromRecord(withRecord(stamped)))).toEqual(['beat:older', 'stance:old', 'emotion:new']);
  });

  it('namespaces ids so an entity cannot steal an actor, fork or slot cube edge', () => {
    const r = mergeBeats(createEventRecord(), [
      { id: 'wife', slot: 'stage1.trigger', text: 'x', label: 'x' },
      { id: 'stage1.trigger', slot: 'stage1.trigger', text: 'y', label: 'y' },
    ]);
    const ids = Object.keys(nodesFromRecord(withRecord(r)));
    expect(ids).toEqual(['beat:wife', 'beat:stage1.trigger']);
    for (const id of ids) expect(id.startsWith('actor:') || id.startsWith('fork:')).toBe(false);
    expect(endpointFor('beat', 'wife')).toBe('beat:wife');
  });
});

describe('the display guard bites here, and only here', () => {
  it('the wound and the ADHD pattern are stored and never drawn', () => {
    let r = mergeStances(createEventRecord(), [
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', label: 'אני לא שווה', source: 'stated' },
      { id: 'a', slot: 'stage2.adhd_pattern', type: 'reading', actor: 'self', text: 'חוסר ארגון', label: 'חוסר ארגון', source: 'stated' },
      { id: 'c', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'בלעדיי', label: 'בלעדיי', source: 'stated' },
    ]);
    expect(r.stances.w.text).toBe('אני לא שווה');        // stored — the Router needs it
    const drawn = nodesFromRecord(withRecord(r));
    expect(Object.keys(drawn)).toEqual(['stance:c']);     // never drawn
    expect(JSON.stringify(drawn)).not.toContain('אני לא שווה');
  });
});

// The ownership test as a filter on the drawing (transition-protocol, מבחן הבעלות).
describe('only what he owns is drawn', () => {
  const stance = (id, source) => ({ id, slot: 'stage2.causal', type: 'reading', actor: 'self', text: id, label: id, ...(source ? { source } : {}) });

  it('draws stated and attributed; keeps inferred and unknown off the map', () => {
    const r = mergeStances(createEventRecord(), [
      stance('mine', 'stated'),
      stance('hers', 'attributed'),
      stance('offered', 'inferred'),
      stance('nobodys', 'unknown'),
      stance('unsaid'), // no source at all — the record defaults it to unknown
    ]);
    expect(r.stances.unsaid.source).toBe('unknown');      // stored, like U
    expect(Object.keys(nodesFromRecord(withRecord(r)))).toEqual(['stance:mine', 'stance:hers']);
  });

  it('the same for feelings; a beat has no source and is drawn', () => {
    let r = mergeEmotions(createEventRecord(), [
      { id: 'felt', slot: 'stage3.emotion', name: 'עלבון', source: 'stated' },
      { id: 'she_felt', slot: 'stage3.emotion', name: 'מבואסת', actor: 'wife', source: 'attributed' },
      { id: 'guess', slot: 'stage3.emotion', name: 'בושה', source: 'inferred' },
      { id: 'who_knows', slot: 'stage3.emotion', name: 'כעס' },
    ]);
    r = mergeBeats(r, [{ id: 'did', slot: 'stage1.trigger', text: 'עברת', label: 'עברת' }]);
    expect(Object.keys(nodesFromRecord(withRecord(r))).sort()).toEqual(['beat:did', 'emotion:felt', 'emotion:she_felt']);
  });

  it('is drawn once the registrar re-reports it as his', () => {
    let r = mergeStances(createEventRecord(), [stance('later', 'unknown')]);
    expect(nodesFromRecord(withRecord(r))).toEqual({});
    r = mergeStances(r, [{ id: 'later', source: 'stated' }]);
    expect(Object.keys(nodesFromRecord(withRecord(r)))).toEqual(['stance:later']);
  });
});

describe('naming a cube is the model judgement, trimming is the fallback', () => {
  it('prefers the registrar label over the text', () => {
    const r = mergeBeats(createEventRecord(), [
      { id: 'b', slot: 'stage1.trigger', text: 'עברת בסלון ושמעת אותן בוחרות צימר לראש השנה', label: 'עברת בסלון' },
    ]);
    expect(nodesFromRecord(withRecord(r))['beat:b'].label).toBe('עברת בסלון');
  });

  it('falls back to a trimmed text so a cube is never empty', () => {
    const r = mergeBeats(createEventRecord(), [
      { id: 'b', slot: 'stage1.trigger', text: 'עברת בסלון ושמעת אותן בוחרות צימר לראש השנה' },
    ]);
    const label = nodesFromRecord(withRecord(r))['beat:b'].label;
    expect(label.length).toBeLessThanOrEqual(20);
    expect('עברת בסלון ושמעת אותן בוחרות צימר לראש השנה').toContain(label);
  });

  it('names an emotion from its own field when unlabelled', () => {
    const r = mergeEmotions(createEventRecord(), [{ id: 'e', slot: 'stage3.emotion', name: 'עלבון', source: 'stated' }]);
    expect(nodesFromRecord(withRecord(r))['emotion:e'].label).toBe('עלבון');
  });

  it('trimLabel keeps short text whole and breaks on a word boundary', () => {
    expect(trimLabel('עברת בסלון')).toBe('עברת בסלון');
    expect(trimLabel('  ')).toBe('');
    expect(trimLabel(undefined)).toBe('');
  });
});

describe('the two clocks reach the map from the record', () => {
  it('a standing stance is ground, a momentary one is a station', () => {
    const r = mergeStances(createEventRecord(), [
      { id: 'now', slot: 'stage2.causal', type: 'reading', text: 'בלעדיי', label: 'בלעדיי', source: 'stated' },
      { id: 'always', slot: 'stage2.meaning', type: 'reading', text: 'אין לי אמירה', label: 'אין לי אמירה', scale: 'ongoing', source: 'stated' },
    ]);
    const n = nodesFromRecord(withRecord(r));
    expect(n['stance:now'].scale).toBe('episode');
    expect(n['stance:always'].scale).toBe('ongoing');
  });

  it("an emotion's scale comes from its pace, so the two cannot disagree", () => {
    const r = mergeEmotions(createEventRecord(), [
      { id: 'a', slot: 'stage3.emotion', name: 'עלבון', pace: 'situational', source: 'stated' },
      { id: 'b', slot: 'stage3.emotion', name: 'שחיקה', pace: 'prior', source: 'stated' },
      { id: 'c', slot: 'stage3.emotion', name: 'רגישות', pace: 'trait', source: 'stated' },
    ]);
    const n = nodesFromRecord(withRecord(r));
    expect([n['emotion:a'].scale, n['emotion:b'].scale, n['emotion:c'].scale])
      .toEqual(['episode', 'ongoing', 'ongoing']);
  });
});
