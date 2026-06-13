// PromptBuilder — assembles the prompt sent to the model each turn.
// Sends: global persona + forbidden list + current-stage agent prompt +
//        state summary (not full history) + last K turns.
// Stage 2: stub — returns a minimal prompt for use with the Mock adapter.

import { FORBIDDEN_PATTERNS } from '../content/forbidden.js';

const LAST_K_TURNS = 6;

export function buildPrompt({ systemPrompt, stagePrompt, state, history }) {
  const stateSummary = summarizeState(state);
  const recentHistory = history.slice(-LAST_K_TURNS);

  return {
    system: [systemPrompt, stagePrompt, FORBIDDEN_PATTERNS.join('\n'), stateSummary]
      .filter(Boolean)
      .join('\n\n---\n\n'),
    messages: recentHistory,
  };
}

function summarizeState(state) {
  const { coverage, meta, facts, thoughts, feelings, reactions } = state;
  return `STATE SUMMARY (hidden from user):
stage: ${meta.currentStage}
questions_this_stage: ${meta.questionCount}
saturation: ${meta.saturationCount}
aperture: ${meta.questionAperture}
resistance: ${meta.resistanceFlag ?? 'none'}
facts: ${JSON.stringify(facts)}
thoughts: ${JSON.stringify(thoughts)}
feelings: ${JSON.stringify(feelings)}
reactions: ${JSON.stringify(reactions)}
coverage: ${JSON.stringify(coverage)}
threads: ${JSON.stringify(meta.savedThreads)}`;
}
