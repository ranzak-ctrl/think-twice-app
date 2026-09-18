import { describe, it, expect } from 'vitest';
import { createEventRecord, mergeBeats, mergeStances, mergeEmotions, mergeSetting } from '../../src/core/eventRecord.js';
import { nodesFromRecord, trimLabel, endpointFor } from '../../src/core/eventMap.js';

const withRecord = (r) => ({ eventRecord: r });

describe('nodesFromRecord — the map becomes a rendering of the ledger', () => {
  it('returns nothing without a record or with an empty one', () => {
    expect(nodesFromRecord({})).toEqual({});
    expect(nodesFromRecord(withRecord(createEventRecord()))).toEqual({});
  });

  it('emits the shape state.nodes holds, so the switch is one line', () => {
    const r = mergeBeats(createEventRecord(), [
      { id: 'b1', slot: 'stage1.trigger', text: 'עברת בסלון', label: 'עברת בסלון' },
    ]);
    expect(nodesFromRecord(withRecord(r))['beat:b1']).toEqual({
      id: 'beat:b1', label: 'עברת בסלון', slot: 'stage1.trigger', scale: 'episode', seq: 1,
    });
  });

  it('draws beats, stances and emotions — and never the setting', () => {
    let r = mergeSetting(createEventRecord(), { place: 'בסלון', conditions: ['גב תפוס'] });
    r = mergeBeats(r, [{ id: 'b', slot: 'stage1.trigger', text: 'עברת', label: 'עברת' }]);
    r = mergeStances(r, [{ id: 's', slot: 'stage2.causal', type: 'reading', text: 'בלעדיי', label: 'בלעדיי' }]);
    r = mergeEmotions(r, [{ id: 'e', slot: 'stage3.emotion', name: 'עלבון', label: 'עלבון' }]);
    const ids = Object.keys(nodesFromRecord(withRecord(r)));
    expect(ids).toEqual(['beat:b', 'stance:s', 'emotion:e']);
    expect(JSON.stringify(nodesFromRecord(withRecord(r)))).not.toContain('בסלון');
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
      { id: 'w', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא שווה', label: 'אני לא שווה' },
      { id: 'a', slot: 'stage2.adhd_pattern', type: 'reading', actor: 'self', text: 'חוסר ארגון', label: 'חוסר ארגון' },
      { id: 'c', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'בלעדיי', label: 'בלעדיי' },
    ]);
    expect(r.stances.w.text).toBe('אני לא שווה');        // stored — the Router needs it
    const drawn = nodesFromRecord(withRecord(r));
    expect(Object.keys(drawn)).toEqual(['stance:c']);     // never drawn
    expect(JSON.stringify(drawn)).not.toContain('אני לא שווה');
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
    const r = mergeEmotions(createEventRecord(), [{ id: 'e', slot: 'stage3.emotion', name: 'עלבון' }]);
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
      { id: 'now', slot: 'stage2.causal', type: 'reading', text: 'בלעדיי', label: 'בלעדיי' },
      { id: 'always', slot: 'stage2.meaning', type: 'reading', text: 'אין לי אמירה', label: 'אין לי אמירה', scale: 'ongoing' },
    ]);
    const n = nodesFromRecord(withRecord(r));
    expect(n['stance:now'].scale).toBe('episode');
    expect(n['stance:always'].scale).toBe('ongoing');
  });

  it("an emotion's scale comes from its pace, so the two cannot disagree", () => {
    const r = mergeEmotions(createEventRecord(), [
      { id: 'a', slot: 'stage3.emotion', name: 'עלבון', pace: 'situational' },
      { id: 'b', slot: 'stage3.emotion', name: 'שחיקה', pace: 'prior' },
      { id: 'c', slot: 'stage3.emotion', name: 'רגישות', pace: 'trait' },
    ]);
    const n = nodesFromRecord(withRecord(r));
    expect([n['emotion:a'].scale, n['emotion:b'].scale, n['emotion:c'].scale])
      .toEqual(['episode', 'ongoing', 'ongoing']);
  });
});
