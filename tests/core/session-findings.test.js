import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn } from '../helpers/engine.js';

// Integration: per-slot findings routing in runTurn — bare slot names attach to the
// current stage; "stageN.slot" keys attach to that stage; unknown slots are ignored.
// Findings are guide-mode observability only and never affect the Router.
beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

async function runWithEval(evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['1:0'];
  MOCK_RESPONSES['1:0'] = { message: 'שאלה.', evaluation: { new_info: true, ...evaluation } };
  const result = await runTurn(createState(), [], 'תשובה');
  MOCK_RESPONSES['1:0'] = saved;
  return result;
}

describe('session — slot findings routing', () => {
  it('attaches bare-name findings to the current stage', async () => {
    const { nextState } = await runWithEval({
      slots: { timeline: 1, actors: 2 },
      slot_findings: {
        timeline: ['האירוע בערב', 'עד אז צריך לארגן את הבית'],
        actors: ['אתה', 'אשתך', 'רומי הבת הגדולה'],
      },
    });
    expect(nextState.findings.stage1.timeline).toEqual(['האירוע בערב', 'עד אז צריך לארגן את הבית']);
    expect(nextState.findings.stage1.actors).toEqual(['אתה', 'אשתך', 'רומי הבת הגדולה']);
  });

  it('routes a cross-stage findings key to its owning stage', async () => {
    const { nextState } = await runWithEval({
      slot_findings: { 'stage3.emotion': ['תחושת עלבון'] },
    });
    expect(nextState.findings.stage3.emotion).toEqual(['תחושת עלבון']);
    expect(nextState.findings.stage1).toBeUndefined();
  });

  it('ignores findings for unknown slots', async () => {
    const { nextState } = await runWithEval({
      slot_findings: { bogus: ['x'], 'stage5.nope': ['y'] },
    });
    expect(nextState.findings).toEqual({});
  });

  it('records findings without requiring a matching slot score', async () => {
    // The model may surface a finding before scoring the slot — still captured.
    const { nextState } = await runWithEval({ slot_findings: { status: ['עדיין פתוח'] } });
    expect(nextState.findings.stage1.status).toEqual(['עדיין פתוח']);
  });
});
