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
