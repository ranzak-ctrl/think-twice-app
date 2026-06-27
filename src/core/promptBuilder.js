import personaMd from '../content/prompts/persona.md?raw';
import evaluatorMd from '../content/prompts/evaluator.md?raw';
import resistanceMd from '../content/prompts/resistance.md?raw';
import summaryMd from '../content/prompts/summary.md?raw';
import openerMd from '../content/prompts/opener.md?raw';
import boardMd from '../content/prompts/board.md?raw';
import stage1Md from '../content/prompts/agents/stage1-intake.md?raw';
import stage2Md from '../content/prompts/agents/stage2-interpretation.md?raw';
import stage3Md from '../content/prompts/agents/stage3-feel.md?raw';
import stage4Md from '../content/prompts/agents/stage4-react.md?raw';
import stage5Md from '../content/prompts/agents/stage5-transform.md?raw';
import stage6Md from '../content/prompts/agents/stage6-alternatives.md?raw';
import stage7Md from '../content/prompts/agents/stage7-decision.md?raw';
import { FORBIDDEN_PATTERNS } from '../content/forbidden.js';

const STAGE_PROMPTS = {
  1: stage1Md,
  2: stage2Md,
  3: stage3Md,
  4: stage4Md,
  5: stage5Md,
  6: stage6Md,
  7: stage7Md,
};

const LAST_K_TURNS = 6;

export function buildSystemPrompt({ stage, state }) {
  const stagePrompt = STAGE_PROMPTS[stage] ?? '';
  const stateSummary = summarizeState(state);

  return [
    personaMd,
    resistanceMd,
    stagePrompt,
    evaluatorMd,
    '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    stateSummary,
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// Summary mode — built when the Router decides a stage transition is due.
// Persona + summary instruction + state only; no probing agent, no evaluator.
export function buildSummaryPrompt({ state }) {
  return [
    personaMd,
    summaryMd,
    '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    summarizeState(state),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// Summary mode reuses the live conversation, which on the real API can pull the
// model into CONTINUING the dialogue (a fresh probe) instead of summarizing — the
// dissonance Ran hit (confirmation requested, but the message was a follow-up
// question, not a recap). Anchor the call with the model's last probe + an explicit
// instruction so the next reply is a recap. Role-valid (… user → assistant → user).
export const SUMMARY_NUDGE =
  'תודה. לפני שנמשיך הלאה — סכם בקצרה, במילים שלי, את מה שמסרתי בשלב הזה בלבד, ובקש אישור. ' +
  'פתח ב"בוא נוודא שהבנתי נכון —" וסיים ב"זה מדויק?". אל תשאל שאלה חדשה, אל תעמיק ואל תוסיף מידע.';

export function buildSummaryMessages(messages, probeMessage) {
  if (!probeMessage) return messages; // no probe to anchor (rare) — leave as-is
  return [
    ...messages,
    { role: 'assistant', content: probeMessage },
    { role: 'user', content: SUMMARY_NUDGE },
  ];
}

// Opener mode — built on a stage transition. The opening question must NOT be a
// generic prompt ("how do you see it?"); it must depart from the user's own words
// (יציאה מדברי המרואיין) and anchor in a concrete detail of the story just told,
// then aim at the new stage's focus. Includes the stage agent (for the focus) +
// the opener instruction + state (findings/actor-map carry the story).
export function buildOpenerPrompt({ stage, state }) {
  const stagePrompt = STAGE_PROMPTS[stage] ?? '';
  return [
    personaMd,
    stagePrompt,
    openerMd,
    '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    summarizeState(state),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// The opener runs right after the user confirmed the summary, so the conversation
// ends on the assistant's summary — but the API requires the messages to END WITH A
// USER turn (no assistant prefill). Append the user's confirmation so the model's
// reply is the opening question.
export const OPENER_NUDGE = 'כן, זה מדויק. אפשר להמשיך.';

export function buildOpenerMessages(messages) {
  return [...messages, { role: 'user', content: OPENER_NUDGE }];
}

// Board mode — built when the Router returns SHOW_BOARD (stage 7). The code owns
// the board: the model synthesises rows from the collected basket; we render them.
export function buildBoardPrompt({ state }) {
  const basket = `## BASKET (חלופות שנאספו)\n${JSON.stringify(state.basket ?? [])}`;
  return [
    personaMd,
    boardMd,
    '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    basket,
    summarizeState(state),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

export function formatHistory(history) {
  const recent = history.slice(-LAST_K_TURNS);
  const firstUserIdx = recent.findIndex((m) => m.role === 'user');
  if (firstUserIdx === -1) return [];
  return recent.slice(firstUserIdx).map((m) => ({
    role: m.role,
    content: m.content,
  }));
}

function summarizeState(state) {
  const { coverage, meta, facts, thoughts, feelings, reactions } = state;
  const threads = (meta.savedThreads ?? []).length
    ? `\nsaved_threads: ${JSON.stringify(meta.savedThreads)}`
    : '';
  // Surface the current cast so the model maintains ONE coherent map (refine, don't
  // duplicate) and knows which characters still need disambiguation.
  const actorMap = Object.keys(state.actorMap ?? {}).length
    ? `\nactor_map: ${JSON.stringify(state.actorMap)}`
    : '';
  return `## STATE SUMMARY (hidden from user)
stage: ${meta.currentStage}
questions_this_stage: ${meta.questionCount}
saturation: ${meta.saturationCount}
question_aperture: ${meta.questionAperture}
resistance: ${meta.resistanceFlag || 'none'}${threads}${actorMap}
facts: ${JSON.stringify(facts)}
thoughts: ${JSON.stringify(thoughts)}
feelings: ${JSON.stringify(feelings)}
reactions: ${JSON.stringify(reactions)}
coverage: ${JSON.stringify(coverage)}`;
}
