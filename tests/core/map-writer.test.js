// Who writes the map stores (Ran, 18.9.2026: the registrar is the sole writer of the
// graph; 24.10.2026: both interviews draw from its record, and the interviewer's
// evaluation stops carrying the map layer). The pack's `map.source` decides:
// 'reported' keeps the interviewer's nodes · edges · groups · open_forks · map_labels
// as before; 'record' ignores them, so a model that still emits them changes nothing.
// And the guidelines' `tail` is the last thing on the turn prompt, and only there.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { runTurn, buildSystemPromptParts, buildSystemPrompt, buildOpenerPrompt, buildSummaryPrompt, buildBoardPrompt, engine } from '../helpers/engine.js';
import { thinkTwiceAdult as adult } from '../../src/packs/think-twice-adult/pack.js';
import { mapSource } from '../../src/core/pack.js';
import { four, prompts as fourPrompts } from '../helpers/four-stage.js';
import { createEngine } from '../../src/core/engine.js';
import { parseResponse } from '../../src/core/responseParser.js';

beforeEach(() => vi.stubEnv('VITE_USE_MOCK', 'true'));
afterEach(() => vi.unstubAllEnvs());

const MAP_LAYER = {
  slots: { trigger: 2 },
  map_labels: { trigger: 'הבשר הגיע' },
  nodes: [{ id: 'n1', label: 'קובייה מדווחת', slot: 'stage1.trigger', scale: 'episode' }],
  edges: [{ id: 'e1', from: 'n1', to: 'stage1.timeline', kind: 'then', confirmed: true }],
  groups: [{ id: 'g1', label: 'המטבח', members: ['n1', 'stage1.timeline'], confirmed: true }],
  open_forks: [{ id: 'f1', question: 'האם הבשר היה טרי?', options: ['כן', 'לא'] }],
};

async function adultTurn(evaluation) {
  const { MOCK_RESPONSES, resetMockCounters } = await import('../../src/adapters/model.js');
  resetMockCounters();
  const saved = MOCK_RESPONSES['1:0'];
  MOCK_RESPONSES['1:0'] = { message: 'שאלה.', evaluation: { new_info: true, ...evaluation } };
  const result = await runTurn(createState(), [], 'תשובה');
  MOCK_RESPONSES['1:0'] = saved;
  return result;
}

describe('a record map ignores the map layer the interviewer reports', () => {
  it('Think Twice draws from the record', () => {
    expect(mapSource(adult)).toBe('record');
  });

  it('leaves nodes, edges, groups, forks and labels untouched, and keeps the slot score', async () => {
    const { nextState } = await adultTurn(MAP_LAYER);
    expect(nextState.nodes).toEqual({});
    expect(nextState.edges).toEqual({});
    expect(nextState.groups).toEqual({});
    expect(nextState.openForks).toEqual({});
    expect(nextState.mapLabels?.stage1?.trigger).toBeUndefined();
    expect(nextState.coverage.stage1.trigger).toBe(2);
  });

  it('does not show the interviewer `nodes` it cannot correct', () => {
    const s = createState(adult);
    const state = { ...s, nodes: { n1: { id: 'n1', label: 'ישן', slot: 'stage1.trigger', scale: 'episode', seq: 1 } } };
    expect(buildSystemPrompt({ state, stage: 1 })).not.toContain('nodes:');
  });
});

describe('a reported map keeps the interviewer as the writer', () => {
  it('merges the same report into the stores, through the four-stage pack', async () => {
    expect(mapSource(four)).toBe('reported');
    // The same report, on that pack's own slots (event · when).
    const report = {
      slots: { event: 2 },
      map_labels: { event: 'הבשר הגיע' },
      nodes: [{ id: 'n1', label: 'קובייה מדווחת', slot: 'stage1.event', scale: 'episode' }],
      edges: [{ id: 'e1', from: 'n1', to: 'stage1.when', kind: 'then', confirmed: true }],
      groups: [{ id: 'g1', label: 'המטבח', kind: 'community', members: ['n1', 'stage1.when'], confirmed: true }],
      open_forks: MAP_LAYER.open_forks,
    };
    // Through the parser, as the adapter would hand it over (camelCase keys).
    const complete = async ({ mode }) =>
      mode === 'registrar'
        ? { ok: true, raw: '{}', message: null, evaluation: null, usage: null }
        : { ...parseResponse(JSON.stringify({ message: 'שאלה.', evaluation: { new_info: true, ...report } })), usage: null };
    const texts = { ...fourPrompts, stages: Object.fromEntries(four.stages.map((st) => [st.key, `[${st.key}]`])) };
    const e = createEngine({ pack: four, prompts: texts, complete });
    const { nextState } = await e.runTurn(e.createState(), [], 'תשובה');
    expect(Object.keys(nextState.nodes)).toEqual(['n1']);
    expect(Object.keys(nextState.openForks)).toEqual(['f1']);
    expect(nextState.mapLabels?.stage1?.event).toBe('הבשר הגיע');
    expect(Object.keys(nextState.edges)).toEqual(['n1→stage1.when']); // keyed by endpoints (state.mergeEdges)
    expect(Object.keys(nextState.groups)).toEqual(['g1']);
  });
});

describe('the guidelines tail is the last thing on the turn prompt', () => {
  const tailed = {
    ...engine.prompts,
    guidelines: {
      ...engine.prompts.guidelines,
      specific: engine.prompts.guidelines.specific + '<!-- @zz-test-check tail -->\nבדיקה אחרונה לפני שליחה.\n',
    },
  };

  it('after the state summary, in the uncached half', () => {
    const state = createState(adult);
    const parts = buildSystemPromptParts({ state, stage: 1, prompts: tailed });
    expect(parts.stable).not.toContain('בדיקה אחרונה לפני שליחה');
    expect(parts.volatile.trimEnd().endsWith('בדיקה אחרונה לפני שליחה.')).toBe(true);
    expect(parts.volatile.indexOf('STATE SUMMARY')).toBeLessThan(parts.volatile.indexOf('בדיקה אחרונה'));
  });

  it('and nowhere on the summary, the opener or the board', () => {
    const state = createState(adult);
    expect(buildSummaryPrompt({ state, prompts: tailed })).not.toContain('בדיקה אחרונה');
    expect(buildOpenerPrompt({ state, stage: 2, prompts: tailed })).not.toContain('בדיקה אחרונה');
    expect(buildBoardPrompt({ state, prompts: tailed })).not.toContain('בדיקה אחרונה');
  });
});
