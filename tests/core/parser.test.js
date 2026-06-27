import { describe, it, expect } from 'vitest';
import { parseResponse } from '../../src/core/responseParser.js';

// Deterministic guard for the stage-4 board pipeline schema.
describe('parseResponse — alternatives & board', () => {
  it('extracts the alternatives array (stage 6)', () => {
    const raw = JSON.stringify({
      message: 'מה עוד אפשר?',
      evaluation: { alternatives: ['אתקשר אליו', 'לא אעשה כלום'] },
    });
    const r = parseResponse(raw);
    expect(r.ok).toBe(true);
    expect(r.evaluation.alternatives).toEqual(['אתקשר אליו', 'לא אעשה כלום']);
  });

  it('extracts board rows (board mode)', () => {
    const raw = JSON.stringify({
      message: 'במה אתה בוחר?',
      evaluation: { board: [{ option: 'א', pro: 'ב', con: 'ג' }] },
    });
    const r = parseResponse(raw);
    expect(r.evaluation.board).toEqual([{ option: 'א', pro: 'ב', con: 'ג' }]);
  });

  it('defaults alternatives and board to empty arrays when absent', () => {
    const r = parseResponse(JSON.stringify({ message: 'שלום?' }));
    expect(r.evaluation.alternatives).toEqual([]);
    expect(r.evaluation.board).toEqual([]);
  });

  it('ignores non-array alternatives/board', () => {
    const r = parseResponse(
      JSON.stringify({ message: 'שלום?', evaluation: { alternatives: 'x', board: 5 } })
    );
    expect(r.evaluation.alternatives).toEqual([]);
    expect(r.evaluation.board).toEqual([]);
  });

  it('extracts stage-7 fields: merge_attempt, emotion_intensity, decision', () => {
    const raw = JSON.stringify({
      message: 'במה אתה בוחר?',
      evaluation: {
        merge_attempt: 'real',
        emotion_intensity: 7,
        decision: { choice: 'X', package_gain: 'g', package_cost: 'c' },
      },
    });
    const r = parseResponse(raw);
    expect(r.evaluation.mergeAttempt).toBe('real');
    expect(r.evaluation.emotionIntensity).toBe(7);
    expect(r.evaluation.decision).toEqual({ choice: 'X', package_gain: 'g', package_cost: 'c' });
  });

  it('defaults the new stage-7 fields to null', () => {
    const r = parseResponse(JSON.stringify({ message: 'שלום?' }));
    expect(r.evaluation.mergeAttempt).toBeNull();
    expect(r.evaluation.emotionIntensity).toBeNull();
    expect(r.evaluation.decision).toBeNull();
  });
});

describe('parseResponse — slot findings', () => {
  it('parses a slot_findings map, trimming and dropping empties', () => {
    const raw = JSON.stringify({
      message: 'מי עוד היה שם?',
      evaluation: {
        slot_findings: {
          timeline: ['  האירוע בערב ', 'עד אז צריך לארגן את הבית'],
          actors: ['אתה', '', '   ', 'רומי הבת הגדולה'],
        },
      },
    });
    expect(parseResponse(raw).evaluation.slotFindings).toEqual({
      timeline: ['האירוע בערב', 'עד אז צריך לארגן את הבית'],
      actors: ['אתה', 'רומי הבת הגדולה'],
    });
  });

  it('drops non-array values and slots that end up empty', () => {
    const raw = JSON.stringify({
      message: 'a',
      evaluation: { slot_findings: { timeline: 'x', actors: [' ', 5, null], status: ['ok'] } },
    });
    expect(parseResponse(raw).evaluation.slotFindings).toEqual({ status: ['ok'] });
  });

  it('defaults slotFindings to an empty object when absent or non-object', () => {
    expect(parseResponse(JSON.stringify({ message: 'a' })).evaluation.slotFindings).toEqual({});
    expect(
      parseResponse(JSON.stringify({ message: 'a', evaluation: { slot_findings: ['x'] } }))
        .evaluation.slotFindings,
    ).toEqual({});
  });
});

describe('parseResponse — actor map', () => {
  it('parses the cast, defaulting clear→true and actions→[], trimming actions', () => {
    const raw = JSON.stringify({
      message: 'מי עוד היה שם?',
      evaluation: {
        actor_map: [
          { id: 'user', label: ' המשתמש ', role: 'המספר', relation: 'עצמו', actions: [' עזב ', '', 'התקשר'] },
          { id: 'sister', label: 'נורית', role: 'אחות', relation: 'אחות המשתמש', clear: true, actions: ['לא ענתה להודעות'] },
          { id: 'father', label: 'אבא', role: '', relation: '', clear: false },
        ],
      },
    });
    expect(parseResponse(raw).evaluation.actorMap).toEqual([
      { id: 'user', label: 'המשתמש', role: 'המספר', relation: 'עצמו', clear: true, actions: ['עזב', 'התקשר'] },
      { id: 'sister', label: 'נורית', role: 'אחות', relation: 'אחות המשתמש', clear: true, actions: ['לא ענתה להודעות'] },
      { id: 'father', label: 'אבא', role: '', relation: '', clear: false, actions: [] },
    ]);
  });

  it('drops entries without a label and falls back id→label', () => {
    const raw = JSON.stringify({
      message: 'a',
      evaluation: { actor_map: [{ role: 'x' }, { label: 'רומי' }] },
    });
    expect(parseResponse(raw).evaluation.actorMap).toEqual([
      { id: 'רומי', label: 'רומי', role: '', relation: '', clear: true, actions: [] },
    ]);
  });

  it('returns null when actor_map is absent, empty, or non-array', () => {
    expect(parseResponse(JSON.stringify({ message: 'a' })).evaluation.actorMap).toBeNull();
    expect(
      parseResponse(JSON.stringify({ message: 'a', evaluation: { actor_map: [] } })).evaluation
        .actorMap,
    ).toBeNull();
    expect(
      parseResponse(JSON.stringify({ message: 'a', evaluation: { actor_map: 'x' } })).evaluation
        .actorMap,
    ).toBeNull();
  });
});

describe('parseResponse — gap observations', () => {
  it('parses and clamps gap_observations', () => {
    const raw = JSON.stringify({
      message: 'מתי הוא התקשר?',
      evaluation: {
        gap_observations: [
          { target: 'stage1.timeline', dimension: 'factual', level: 2, note: 'סדר הפוך' },
          { target: 'topic:חיסכון', level: 0 },
        ],
      },
    });
    expect(parseResponse(raw).evaluation.gapObservations).toEqual([
      { target: 'stage1.timeline', dimension: 'factual', level: 2, note: 'סדר הפוך' },
      { target: 'topic:חיסכון', dimension: 'factual', level: 1, note: '' },
    ]);
  });

  it('drops entries without a target or numeric level', () => {
    const raw = JSON.stringify({
      message: 'שלום?',
      evaluation: { gap_observations: [{ level: 3 }, { target: 'x', level: 'y' }, { target: '  ' }] },
    });
    expect(parseResponse(raw).evaluation.gapObservations).toEqual([]);
  });

  it('defaults gapObservations to an empty array when absent or non-array', () => {
    expect(parseResponse(JSON.stringify({ message: 'a' })).evaluation.gapObservations).toEqual([]);
    expect(
      parseResponse(JSON.stringify({ message: 'a', evaluation: { gap_observations: 'x' } }))
        .evaluation.gapObservations,
    ).toEqual([]);
  });
});
