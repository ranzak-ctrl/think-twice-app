import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createState } from '../../src/core/state.js';
import { generateStageOpener } from '../../src/core/session.js';
import { buildOpenerMessages, OPENER_NUDGE } from '../../src/core/promptBuilder.js';
import { signpostForStage } from '../../src/content/signposting.js';

// The stage opener is model-generated and anchored in the user's story (real API).
// Offline (mock / no key) it falls back to the static signpost — deterministic.
beforeEach(() => vi.stubEnv('VITE_ANTHROPIC_API_KEY', ''));
afterEach(() => vi.unstubAllEnvs());

const atStage = (n) => {
  const s = createState();
  return { ...s, meta: { ...s.meta, currentStage: n } };
};

describe('generateStageOpener', () => {
  it('falls back to the static signpost when no anchored opener is available (mock)', async () => {
    const { message } = await generateStageOpener(atStage(2), []);
    expect(message).toBe(signpostForStage(2));
  });

  it('uses the current stage for the fallback', async () => {
    const { message } = await generateStageOpener(atStage(5), []);
    expect(message).toBe(signpostForStage(5));
  });

  it('preserves the usage tally', async () => {
    const s = atStage(3);
    s.meta.usage = { inputTokens: 5, outputTokens: 7, calls: 1 };
    const { nextState } = await generateStageOpener(s, []);
    expect(nextState.meta.usage).toEqual({ inputTokens: 5, outputTokens: 7, calls: 1 });
  });
});

// The conversation ends on the assistant's summary, but the API rejects a trailing
// assistant turn ("does not support assistant message prefill"). The opener call
// must end with a user turn.
describe('buildOpenerMessages', () => {
  it('appends the user confirmation so the messages end with a user turn', () => {
    const convo = [
      { role: 'user', content: '3 ימים' },
      { role: 'assistant', content: 'בוא נוודא... זה מדויק?' },
    ];
    const out = buildOpenerMessages(convo);
    expect(out.length).toBe(convo.length + 1);
    expect(out[out.length - 1]).toEqual({ role: 'user', content: OPENER_NUDGE });
  });

  it('ends with a user turn even from an empty history', () => {
    const out = buildOpenerMessages([]);
    expect(out[out.length - 1].role).toBe('user');
  });

  it('leaves messages unchanged when they already end with a user turn (Re-open)', () => {
    const convo = [
      { role: 'assistant', content: 'שאלה' },
      { role: 'user', content: 'אני אדבר איתו וגם אחכה' },
    ];
    expect(buildOpenerMessages(convo)).toBe(convo);
  });
});
