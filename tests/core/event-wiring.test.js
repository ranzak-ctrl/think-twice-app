import { describe, it, expect } from 'vitest';
import { createState, importState, exportState, mergeActorMap } from '../../src/core/state.js';
import { mergeBeats, mergeSetting, createEventRecord } from '../../src/core/eventRecord.js';
import { buildSystemPrompt } from '../helpers/engine.js';

describe('the registrar ledger is part of the StateDocument', () => {
  it('a fresh state carries an empty record', () => {
    const s = createState();
    expect(s.eventRecord).toEqual(createEventRecord());
  });

  it('the four stores that nothing ever wrote to are gone', () => {
    const s = createState();
    for (const dead of ['facts', 'thoughts', 'feelings', 'reactions']) {
      expect(dead in s).toBe(false);
    }
  });

  it('survives an export/import round trip', () => {
    let s = createState();
    s = { ...s, eventRecord: mergeBeats(s.eventRecord, [
      { id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון', camera: true },
    ]) };
    expect(importState(exportState(s)).eventRecord.beats.b1.text).toBe('עברת בסלון');
  });
});

describe('back-compat with exports that predate the registrar', () => {
  const legacy = () => {
    const s = createState();
    const { eventRecord, ...rest } = s;
    return JSON.stringify({ ...rest, facts: { a: 1 }, thoughts: { b: 2 }, feelings: {}, reactions: {} });
  };

  it('gives an old export an empty record rather than undefined', () => {
    expect(importState(legacy()).eventRecord).toEqual(createEventRecord());
  });

  it('drops the dead stores instead of resurrecting them', () => {
    const s = importState(legacy());
    for (const dead of ['facts', 'thoughts', 'feelings', 'reactions']) {
      expect(dead in s).toBe(false);
    }
  });

  it('still refuses a document with no coverage or meta', () => {
    expect(() => importState('{"eventRecord":{}}')).toThrow();
  });
});

describe('the interviewer prompt carries the account', () => {
  // The previous version passed createState(), whose actorMap is {} — the ONE state
  // in which the old assertion held. A live stage-1 state has a cast the interviewer
  // populated itself, and the account used to leak a section on turn three. The
  // fixture now carries an actor, so the test actually tests the claim it certifies.
  it('omits it entirely while the LEDGER is empty, cast or no cast', () => {
    const state = mergeActorMap(createState(), [{ id: 'boss', label: 'הממונה', clear: true }]);
    const prompt = buildSystemPrompt({ stage: 1, state });
    expect(prompt).not.toContain('המאורע כפי שנאסף');
    expect(prompt).toContain('## STATE SUMMARY');
  });

  it('leads with the account once the registrar has assembled anything', () => {
    let s = createState();
    let rec = mergeSetting(s.eventRecord, { place: 'בסלון', time: 'בערב' });
    rec = mergeBeats(rec, [
      { id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון', camera: true, phase: 'during' },
    ]);
    const prompt = buildSystemPrompt({ stage: 1, state: { ...s, eventRecord: rec } });

    expect(prompt).toContain('## המאורע כפי שנאסף עד כה');
    expect(prompt).toContain('**הזירה:** בסלון · בערב');
    // The story leads; the bookkeeping follows it.
    expect(prompt.indexOf('המאורע כפי שנאסף')).toBeLessThan(prompt.indexOf('## STATE SUMMARY'));
  });

  it('no longer ships four empty objects into every prompt', () => {
    const prompt = buildSystemPrompt({ stage: 1, state: createState() });
    for (const dead of ['facts: {}', 'thoughts: {}', 'feelings: {}', 'reactions: {}']) {
      expect(prompt).not.toContain(dead);
    }
  });
});
