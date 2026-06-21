import { describe, it, expect } from 'vitest';
import {
  createState,
  normalizeTarget,
  recordGapObservation,
  exportState,
  importState,
} from '../../src/core/state.js';

describe('createState gaps', () => {
  it('starts with empty gap records and log', () => {
    expect(createState().gaps).toEqual({ byTarget: {}, log: [] });
  });
});

describe('normalizeTarget', () => {
  it('parses a slot id', () => {
    expect(normalizeTarget('stage1.timeline')).toEqual({
      key: 'stage1.timeline',
      target: { kind: 'slot', stage: 1, slot: 'timeline', label: 'stage1.timeline' },
    });
  });

  it('parses topic and entity labels', () => {
    expect(normalizeTarget('topic:חיסכון').target).toEqual({ kind: 'topic', label: 'חיסכון' });
    expect(normalizeTarget('entity:החבר').key).toBe('entity:החבר');
  });

  it('treats a bare label as a topic and trims it', () => {
    expect(normalizeTarget('  הבשר  ')).toEqual({
      key: 'topic:הבשר',
      target: { kind: 'topic', label: 'הבשר' },
    });
  });

  it('returns null for empty input', () => {
    expect(normalizeTarget('')).toBeNull();
    expect(normalizeTarget(null)).toBeNull();
  });
});

describe('recordGapObservation', () => {
  const obs = (o) => ({ target: 'stage1.timeline', dimension: 'factual', level: 2, note: 'סדר הפוך', ...o });

  it('ignores a consistent observation with no existing record', () => {
    const s = recordGapObservation(createState(), obs({ level: 9 }), 3);
    expect(s.gaps.byTarget).toEqual({});
    expect(s.gaps.log).toEqual([]);
  });

  it('creates a starred record for a gap (level ≤ T_star)', () => {
    const s = recordGapObservation(createState(), obs({ level: 2 }), 3);
    const rec = s.gaps.byTarget['stage1.timeline'];
    expect(rec).toMatchObject({
      status: 'starred',
      level: 2,
      firstTurn: 3,
      lastTurn: 3,
      touches: 0,
      dimension: 'factual',
      note: 'סדר הפוך',
    });
    expect(rec.history).toEqual([{ turn: 3, level: 2 }]);
    expect(s.gaps.log).toHaveLength(1);
    expect(s.gaps.log[0]).toMatchObject({ targetKey: 'stage1.timeline', action: 'star' });
  });

  it('keeps one record per targetKey and grows its history', () => {
    let s = recordGapObservation(createState(), obs({ level: 2 }), 3);
    s = recordGapObservation(s, obs({ level: 4 }), 5);
    const rec = s.gaps.byTarget['stage1.timeline'];
    expect(Object.keys(s.gaps.byTarget)).toEqual(['stage1.timeline']);
    expect(rec).toMatchObject({ level: 4, touches: 1, status: 'starred', firstTurn: 3, lastTurn: 5 });
    expect(rec.history).toEqual([{ turn: 3, level: 2 }, { turn: 5, level: 4 }]);
  });

  it('resolves when a re-touch reaches T_resolved', () => {
    let s = recordGapObservation(createState(), obs({ level: 2 }), 3);
    s = recordGapObservation(s, obs({ level: 9 }), 7);
    expect(s.gaps.byTarget['stage1.timeline'].status).toBe('resolved');
    expect(s.gaps.log.at(-1)).toMatchObject({ action: 'resolve', delta: 7 });
  });

  it('re-opens a resolved target on contradicting info (reversible)', () => {
    let s = recordGapObservation(createState(), obs({ level: 2 }), 3);
    s = recordGapObservation(s, obs({ level: 9 }), 7); // resolved
    s = recordGapObservation(s, obs({ level: 1 }), 9); // contradicts again
    const rec = s.gaps.byTarget['stage1.timeline'];
    expect(rec.status).toBe('starred');
    expect(rec.history).toHaveLength(3);
    expect(s.gaps.log.at(-1)).toMatchObject({ action: 'reopen' });
  });

  it('clamps level into 1..10', () => {
    const low = recordGapObservation(createState(), obs({ level: 0 }), 1);
    expect(low.gaps.byTarget['stage1.timeline'].level).toBe(1);
    let s = recordGapObservation(createState(), obs({ level: 2 }), 1);
    s = recordGapObservation(s, obs({ level: 99 }), 2);
    expect(s.gaps.byTarget['stage1.timeline']).toMatchObject({ level: 10, status: 'resolved' });
  });

  it('ignores an unusable observation (no target or non-numeric level)', () => {
    const base = createState();
    expect(recordGapObservation(base, obs({ target: '' }), 1)).toBe(base);
    expect(recordGapObservation(base, obs({ level: 'x' }), 1)).toBe(base);
  });

  it('does not mutate the input state', () => {
    const base = createState();
    recordGapObservation(base, obs({ level: 2 }), 3);
    expect(base.gaps.byTarget).toEqual({});
  });
});

describe('gaps export/import', () => {
  it('preserves gaps through an export/import round-trip', () => {
    const s = recordGapObservation(
      createState(),
      { target: 'topic:חיסכון', dimension: 'cognitive', level: 4 },
      2,
    );
    const round = importState(exportState(s));
    expect(round.gaps.byTarget['topic:חיסכון']).toMatchObject({ level: 4, dimension: 'cognitive' });
  });

  it('defaults gaps for an older export that predates the field', () => {
    const legacy = createState();
    delete legacy.gaps;
    const round = importState(JSON.stringify(legacy));
    expect(round.gaps).toEqual({ byTarget: {}, log: [] });
  });
});
