import { describe, it, expect } from 'vitest';
import { createState, appendDecisionLog, DECISION_LOG_MAX } from '../../src/core/state.js';

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
});
