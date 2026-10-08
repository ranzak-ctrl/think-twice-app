import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runTurn } from '../helpers/engine.js';
import { confirmAndAdvance } from '../../src/core/router.js';
import { createState } from '../../src/core/state.js';
import { resetMockCounters } from '../../src/adapters/model.js';
import { buildMap } from '../../src/core/storyMap.js';

// End to end, through the real turn loop against the scripted model: what the
// evaluator reports has to survive the parser, the session's merge, the store's
// refusals and the projection, and come out as boxes on the map.
//
// Each of Ran's three faults of 5.9.2026 had every piece in place except one, and
// in two of the three the piece that was missing was a JOIN between layers — an
// edge stored with no way to be drawn, a report the prompt never asked for. A unit
// test on either side of such a join passes while the feature does nothing, which
// is exactly what happened: `groups` has been implemented, tested and shipped since
// the containment ruling and has never once appeared on a screen.
describe('what the model reports reaches the map', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    resetMockCounters();
  });
  afterEach(() => vi.unstubAllEnvs());

  // Run the scripted interview until it has passed the stage the caller asked for.
  const upTo = async (stage) => {
    let state = createState();
    let history = [];
    for (let turns = 0; state.meta.currentStage <= stage && turns < 60; turns++) {
      if (state.meta.awaitingConfirmation) {
        state = confirmAndAdvance(state);
        continue;
      }
      const text = 'אני לא יודע מה לעשות';
      const { nextState, reply } = await runTurn(state, history, text);
      history = [...history, { role: 'user', content: text }, { role: 'assistant', content: reply }];
      state = nextState;
    }
    return state;
  };

  it('draws several cubes out of one slot', async () => {
    const map = buildMap(await upTo(2));
    const causal = [...map.stations, ...map.ground].filter((n) => n.slot === 'stage2.causal');
    expect(causal.length).toBeGreaterThan(1);
  });

  it('puts a standing state on the ground lane, not on the route', async () => {
    const map = buildMap(await upTo(2));
    expect(map.ground.map((n) => n.label)).toContain('המטבח תמיד בלחץ');
    expect(map.stations.map((n) => n.label)).not.toContain('המטבח תמיד בלחץ');
  });

  it('draws a relation from a beat to a character', async () => {
    const map = buildMap(await upTo(2));
    expect(map.arcs.some((a) => a.to === 'actor:manager' && a.kind === 'because')).toBe(true);
  });

  it('draws the arrow between the two clocks', async () => {
    const map = buildMap(await upTo(2));
    expect(map.arcs.some((a) => a.from === 'kitchen_pressure' && a.to === 'stage1.timeline')).toBe(true);
  });

  it('never puts the wound or the ADHD pattern on the map', async () => {
    // The mock seeds both on purpose, so this fails loudly if an exclusion is lost.
    const state = await upTo(2);
    const map = buildMap(state);
    expect(state.coverage.stage2.wound).toBeGreaterThan(0); // it really is on record
    const drawn = [...map.stations, ...map.ground].map((n) => n.slot);
    expect(drawn).not.toContain('stage2.wound');
    expect(drawn).not.toContain('stage2.adhd_pattern');
  });
});
