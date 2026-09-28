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
import registrarMd from '../content/prompts/registrar.md?raw';
import { renderEvent } from './eventView.js';

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

const SEP = '\n\n---\n\n';

// ── WHY THE PROMPT IS SPLIT IN TWO ──
// Measured on the first live run with the registrar on (19.9.2026): 42,890 input
// tokens and $0.14 for ONE turn. evaluator.md is 46KB and registrar.md 48.5KB, and
// both were re-sent in full on every single turn.
//
// Almost all of it never changes, so it can be cached — but only if the unchanging
// part is a stable PREFIX. It already is: the stage prompt and the state summary
// come last. This returns the two halves so the adapter can mark the first one
// cacheable. Nothing is reordered; reordering a prompt changes how the model reads
// it, and that is a clinical question, not a performance one.
//
// The split is described in plain data — `stable` and `volatile` — and NOT in the
// API's cache_control vocabulary. Which of the two is cacheable is a fact about the
// content; how a provider expresses caching belongs to the adapter (principle 4).
export function buildSystemPromptParts({ stage, state }) {
  const stagePrompt = STAGE_PROMPTS[stage] ?? '';
  // The ONLY caller that gets the unredacted account — its output is a question
  // to the person, never a text spoken verbatim, and stage 2 must see the מוגלה to
  // probe it. Summary / opener / board keep the safe default.
  const stateSummary = summarizeState(state, { full: true });

  return {
    // The stage prompt sits inside the cached half deliberately. It changes seven
    // times in an interview, so the cache is rebuilt seven times — against every
    // turn re-sending 46KB. Pulling it out would cache more, at the cost of moving
    // it after the evaluator, which is a change to how the prompt reads.
    stable: [
      personaMd,
      resistanceMd,
      stagePrompt,
      evaluatorMd,
      '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    ].filter(Boolean).join(SEP),
    volatile: stateSummary,
  };
}

// The joined form. Kept because a prompt is one text — tests read it, and a caller
// that does not care about caching should not have to reassemble it.
export function buildSystemPrompt(args) {
  const { stable, volatile } = buildSystemPromptParts(args);
  return [stable, volatile].filter(Boolean).join(SEP);
}

// Registrar mode — the call that assembles the event.
//
// ⚠ THE SWITCH IS ON, and it runs the registrar on every turn of every interview.
// It was flipped for the release of 28.9 (PR #3); what gated it is docs/event-model.md
// §8, and the runs that followed are logged in docs/live-findings.md.
//
// Still true, and the reason this comment is here rather than gone: the automated
// suite cannot judge this prompt. The mock returns '{}' for registrar mode, so the
// e2e golden scripts never exercise it, and the judge needs a live
// ANTHROPIC_API_KEY. Green tests say nothing about what the registrar does to a
// real interview — only a live run does.
//
// To put it back: `npm run registrar:off`. This boolean is the whole switch.
export const REGISTRAR_ENABLED = true;

// The registrar gets the UNREDACTED account, and that is not an oversight.
// prompt-editor caught it while writing registrar.md: `full` defaults to redacting
// NEVER_SHOW_SLOTS, and a redacted account hides the ids of the wound stances THE
// REGISTRAR ITSELF recorded. It reports deltas keyed by id, so it can only leave an
// entity alone — or correct it — if it can see the id it minted. Hand it a redacted
// account and it mints a fresh id for the מוגלה every single turn, filling the
// ledger with duplicates of the one thing that must never be duplicated.
//
// This is safe for the same reason buildSystemPrompt is: the registrar has no
// `message` field and speaks to nobody. Redaction protects the calls whose output
// is spoken to the person; this one produces JSON.
// Returns '' when the switch is off — runRegistrar reads that as "not configured"
// and skips the call, so the falsy string is load-bearing. When on, it returns the
// two halves, for the reason in buildSystemPromptParts above.
export function buildRegistrarPrompt({ state }) {
  if (!REGISTRAR_ENABLED) return '';
  return { stable: registrarMd, volatile: summarizeState(state, { full: true }) };
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
// `situation` (optional) frames the transition — e.g. a Re-open back to an earlier
// stage to complete info — so the opener can explain why we returned. Forward
// transitions omit it.
export function buildOpenerPrompt({ stage, state, situation }) {
  const stagePrompt = STAGE_PROMPTS[stage] ?? '';
  const situationBlock = situation ? `## הקשר המעבר\n${situation}` : '';
  return [
    personaMd,
    stagePrompt,
    openerMd,
    situationBlock,
    '## הנחיות אסורות\n' + FORBIDDEN_PATTERNS.join('\n'),
    summarizeState(state),
  ]
    .filter(Boolean)
    .join('\n\n---\n\n');
}

// The API requires the messages to END WITH A USER turn (no assistant prefill).
// Forward transitions end on the assistant's summary → append the user's
// confirmation; a Re-open already ends on the user's own turn → leave it as is.
export const OPENER_NUDGE = 'כן, זה מדויק. אפשר להמשיך.';

export function buildOpenerMessages(messages) {
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') return messages; // already ends with a user turn
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

// `full` reaches renderEvent: the probe needs the whole account (stage 2 cannot
// explore a wound it is not told about); every user-facing builder gets it redacted.
function summarizeState(state, { full = false } = {}) {
  const { coverage, meta } = state;
  const threads = (meta.savedThreads ?? []).length
    ? `\nsaved_threads: ${JSON.stringify(meta.savedThreads)}`
    : '';
  // Surface the current cast so the model maintains ONE coherent map (refine, don't
  // duplicate) and knows which characters still need disambiguation.
  const actorMap = Object.keys(state.actorMap ?? {}).length
    ? `\nactor_map: ${JSON.stringify(state.actorMap)}`
    : '';
  // Open forks must ride along for the same reason the actor map does: the model
  // reports DELTAS keyed by a stable id, and it can only reuse an id it can see.
  // Without this the model mints a fresh id for the same unresolved question every
  // turn, mergeOpenForks stores each as a new fork, and the person is drawn the
  // same open question three times over. (Caught by prompt-editor, 29.8.2026,
  // while writing the delta rule this line is what makes honourable.)
  const openForks = Object.keys(state.openForks ?? {}).length
    ? `\nopen_forks: ${JSON.stringify(state.openForks)}`
    : '';
  // Edges ride along for the same reason the actor map and the forks do: the model
  // reports DELTAS, and it can only leave an edge alone, or raise one to confirmed,
  // if it can see the edge already on record.
  const edges = Object.keys(state.edges ?? {}).length
    ? `\nedges: ${JSON.stringify(Object.values(state.edges))}`
    : '';
  // And the nodes, for the same delta reason again — plus one of its own. A node is
  // corrected by re-reporting its id, so a model that cannot see the ids it minted
  // last turn cannot correct anything: it can only add a near-duplicate cube beside
  // the one it meant to fix. That is the failure Ran read off a live map on
  // 5.9.2026 from the other direction ("you stopped creating cubes and only updated
  // the existing ones"), and it would come straight back as its mirror image.
  const nodes = Object.keys(state.nodes ?? {}).length
    ? `\nnodes: ${JSON.stringify(Object.values(state.nodes).map(({ seq, ...n }) => n))}`
    : '';
  // Containers likewise: a group is raised to confirmed by re-reporting its id once
  // he has said so, which needs the unconfirmed one to be visible in the meantime.
  const groups = Object.keys(state.groups ?? {}).length
    ? `\ngroups: ${JSON.stringify(Object.values(state.groups))}`
    : '';
  // The assembled event leads, and the bookkeeping follows it. A model handed
  // key-value pairs answers about key-value pairs; a model handed an account asks
  // its next question about the story. Empty until the registrar is wired, so this
  // is a no-op for now — `renderEvent` returns '' for an untouched record.
  const event = renderEvent(state, { full });

  return `${event ? `${event}\n\n` : ''}## STATE SUMMARY (hidden from user)
stage: ${meta.currentStage}
questions_this_stage: ${meta.questionCount}
saturation: ${meta.saturationCount}
question_aperture: ${meta.questionAperture}
resistance: ${meta.resistanceFlag || 'none'}${threads}${actorMap}${openForks}${nodes}${edges}${groups}
coverage: ${JSON.stringify(coverage)}`;
}
