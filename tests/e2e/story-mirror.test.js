import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createState } from '../../src/core/state.js';
import { confirmAndAdvance } from '../../src/core/router.js';
import { runTurn } from '../../src/core/session.js';
import { resetMockCounters } from '../../src/adapters/model.js';
import { buildStory } from '../../src/core/story.js';

// The story mirror over a whole interview, driven through the real pipeline.
//
// The unit tests in tests/core/story.test.js check the projection against states
// built by hand. This one runs the meat golden script end to end and inspects the
// mirror after EVERY turn, because the rule that matters clinically is not "the
// wound is absent at the end" — it is that it was never on screen for a single
// turn in between. The mock deliberately reports a `wound` finding at stage 2
// (src/adapters/model.js) so there is something real to leak.
describe('story mirror — across a full interview', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_USE_MOCK', 'true');
    resetMockCounters();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('never shows the wound or the ADHD pattern on any turn', async () => {
    let state = createState();
    let history = [];
    const snapshots = [];

    for (let turns = 0; !state.meta.sessionComplete && turns < 60; turns++) {
      if (state.meta.awaitingConfirmation) {
        state = confirmAndAdvance(state);
        continue;
      }
      const userText = 'אני לא יודע מה לעשות';
      const { nextState, reply } = await runTurn(state, history, userText);
      history = [
        ...history,
        { role: 'user', content: userText },
        { role: 'assistant', content: reply },
      ];
      state = nextState;
      snapshots.push(buildStory(state));
    }

    expect(state.meta.sessionComplete).toBe(true);

    // The interview really did collect them — otherwise this proves nothing.
    expect(state.findings.stage2.wound).toContain('אני לא שווה כלום');
    expect(state.findings.stage2.adhd_pattern.length).toBeGreaterThan(0);
    const barred = [...state.findings.stage2.wound, ...state.findings.stage2.adhd_pattern];

    // And the mirror never carried them, on any turn.
    for (const story of snapshots) {
      const shown = [
        ...story.nodes.map((n) => n.text),
        ...story.cast.map((a) => a.label),
      ].join(' | ');
      for (const line of barred) expect(shown).not.toContain(line);
    }
  });

  it('grows and never shrinks, and ends as the whole story', async () => {
    let state = createState();
    let history = [];
    const counts = [];

    for (let turns = 0; !state.meta.sessionComplete && turns < 60; turns++) {
      if (state.meta.awaitingConfirmation) {
        state = confirmAndAdvance(state);
        continue;
      }
      const { nextState, reply } = await runTurn(state, history, 'תשובה');
      history = [
        ...history,
        { role: 'user', content: 'תשובה' },
        { role: 'assistant', content: reply },
      ];
      state = nextState;
      const story = buildStory(state);
      counts.push(story.nodes.length);
    }

    // Monotonic: a shape that was drawn is never rubbed out. Someone who saw a
    // detail of their own story appear and then vanish would reasonably conclude
    // the system had lost it. (A slot's TEXT can change when a later finding
    // corrects it — that is the eraser working — but the node stays.)
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);

    // By the close the whole chain is drawn, in story order, every kind present.
    const final = buildStory(state);
    expect(final.nodes.map((n) => n.kind)).toEqual([
      'fact', 'fact', 'fact',
      'thought', 'thought',
      'feeling', 'feeling',
      'action', 'action',
      'plan',
      'other', 'other', 'other',
    ]);
    expect(final.cast.length).toBeGreaterThan(0);
  });
});
