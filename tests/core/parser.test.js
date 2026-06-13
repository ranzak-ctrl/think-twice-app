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
});
