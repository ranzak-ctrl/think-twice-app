import personaMd from '../content/prompts/persona.md?raw';
import evaluatorMd from '../content/prompts/evaluator.md?raw';
import summaryMd from '../content/prompts/summary.md?raw';
import stage1Md from '../content/prompts/agents/stage1-intake.md?raw';
import stage2Md from '../content/prompts/agents/stage2-interpretation.md?raw';
import stage3Md from '../content/prompts/agents/stage3-feel.md?raw';
import stage4Md from '../content/prompts/agents/stage4-react.md?raw';
import { FORBIDDEN_PATTERNS } from '../content/forbidden.js';

const STAGE_PROMPTS = {
  1: stage1Md,
  2: stage2Md,
  3: stage3Md,
  4: stage4Md,
};

const LAST_K_TURNS = 6;

export function buildSystemPrompt({ stage, state }) {
  const stagePrompt = STAGE_PROMPTS[stage] ?? '';
  const stateSummary = summarizeState(state);

  return [
    personaMd,
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
  return `## STATE SUMMARY (hidden from user)
stage: ${meta.currentStage}
questions_this_stage: ${meta.questionCount}
saturation: ${meta.saturationCount}
facts: ${JSON.stringify(facts)}
thoughts: ${JSON.stringify(thoughts)}
feelings: ${JSON.stringify(feelings)}
reactions: ${JSON.stringify(reactions)}
coverage: ${JSON.stringify(coverage)}`;
}
