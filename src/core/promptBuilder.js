import { renderEvent } from './eventView.js';
import { DEFAULT_PACK, stageKey, barredSlots } from './pack.js';
import { composeGuidelines } from './guidelines.js';

// ── THE CORE IMPORTS NO PROMPT ──
// Every text the model reads belongs to the interview pack and arrives here as
// `prompts`, injected by whoever composed the engine:
//
//   { guidelines: { super, specific },             // who the interviewer is (guidelines.js)
//     resistance, evaluator, registrar, summary, opener, board, judge,
//     stages: { stage1: '…', stage2: '…', … },   // one agent prompt per stage key
//     forbidden: ['…', …] }                       // the blacklist, one line each
//
// Every builder also takes the interview's `pack`, for one reason: the account of
// the event is redacted by the pack's barred slots (eventView.js), so which slots a
// summary may recite is the interview's to say. The default is the transitional
// Think Twice pack, as everywhere in phase 1; the turn loop passes its own.
//
// It used to import fourteen .md files with Vite's `?raw` — syntax plain Node
// cannot load, which is exactly what principle 4 forbids, and which welded one
// interview's texts into the engine. Where the texts come from (a bundler, the file
// system, a server) is now the caller's business: the browser build reads them in
// src/packs/think-twice-adult/prompts.js. tests/core/portable-core.test.js loads
// the core in plain Node to keep it that way.
//
// A missing text throws rather than dropping out of the prompt: `.filter(Boolean)`
// below would otherwise assemble a prompt without, say, the interviewer's
// guidelines, and nothing would notice but the person being interviewed.
function text(prompts, key) {
  const v = prompts?.[key];
  if (typeof v !== 'string' || !v) throw new Error(`Interview prompts are missing "${key}"`);
  return v;
}

// The interviewer's guidelines: the super file every Think Twice interviewer
// shares, overridden block by block by this interview's specific file (Ran,
// 9.10.2026; guidelines.js). It stands where the persona always stood, first in
// every prompt the interviewer speaks from.
function guidelines(prompts) {
  const g = prompts?.guidelines;
  if (!g || typeof g.super !== 'string' || typeof g.specific !== 'string') {
    throw new Error('Interview prompts are missing "guidelines"');
  }
  return composeGuidelines(g);
}

// The blacklist rides in every prompt. An empty one would still print its heading
// with nothing under it — the model told there are rules and shown none.
function forbiddenBlock(prompts) {
  const list = prompts?.forbidden;
  if (!Array.isArray(list) || !list.some((l) => typeof l === 'string' && l.trim())) {
    throw new Error('Interview prompts are missing "forbidden"');
  }
  return '## הנחיות אסורות\n' + list.join('\n');
}

// The stage agent for a stage number. Missing is an error, not an empty string:
// `.filter(Boolean)` would drop it, and the probe would go out with no agent for
// the stage it is in (router-guard, 8.10.2026). currentStage is always a stage the
// pack has, so this only fires on a composition that was wrong to begin with.
function stagePromptFor(prompts, stage) {
  if (!prompts?.stages || typeof prompts.stages !== 'object') {
    throw new Error('Interview prompts are missing "stages"');
  }
  const agent = prompts.stages[stageKey(stage)];
  if (typeof agent !== 'string' || !agent) {
    throw new Error(`Interview prompts are missing the agent for ${stageKey(stage)}`);
  }
  return agent;
}

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
export function buildSystemPromptParts({ stage, state, prompts, pack = DEFAULT_PACK }) {
  const stagePrompt = stagePromptFor(prompts, stage);
  // The ONLY caller that gets the unredacted account — its output is a question
  // to the person, never a text spoken verbatim, and stage 2 must see the מוגלה to
  // probe it. Summary / opener / board keep the safe default.
  const stateSummary = summarizeState(state, { full: true, pack, prompts });

  return {
    // The stage prompt sits inside the cached half deliberately. It changes seven
    // times in an interview, so the cache is rebuilt seven times — against every
    // turn re-sending 46KB. Pulling it out would cache more, at the cost of moving
    // it after the evaluator, which is a change to how the prompt reads.
    stable: [
      guidelines(prompts),
      text(prompts, 'resistance'),
      stagePrompt,
      text(prompts, 'evaluator'),
      forbiddenBlock(prompts),
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
// ⚠ THE SWITCH IS ON, and it runs the registrar on every turn of every interview
// that has a registrar text — one may opt out with an explicit null (engine.js).
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
// the barred slots, and a redacted account hides the ids of the wound stances THE
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
export function buildRegistrarPrompt({ state, prompts, pack = DEFAULT_PACK }) {
  if (!REGISTRAR_ENABLED) return '';
  // An interview may run without the registrar, and says so with an explicit
  // null — never by leaving the text out, which createEngine refuses (engine.js).
  if (prompts?.registrar === null) return '';
  return { stable: text(prompts, 'registrar'), volatile: summarizeState(state, { full: true, pack }) };
}

// Summary mode — built when the Router decides a stage transition is due.
// Guidelines + summary instruction + state only; no probing agent, no evaluator.
export function buildSummaryPrompt({ state, prompts, pack = DEFAULT_PACK }) {
  return [
    guidelines(prompts),
    text(prompts, 'summary'),
    forbiddenBlock(prompts),
    summarizeState(state, { pack, prompts }),
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
export function buildOpenerPrompt({ stage, state, situation, prompts, pack = DEFAULT_PACK }) {
  const stagePrompt = stagePromptFor(prompts, stage);
  const situationBlock = situation ? `## הקשר המעבר\n${situation}` : '';
  return [
    guidelines(prompts),
    stagePrompt,
    text(prompts, 'opener'),
    situationBlock,
    forbiddenBlock(prompts),
    summarizeState(state, { pack, prompts }),
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

// Board mode — built when the Router returns SHOW_BOARD (the decision stage; stage 7
// in Think Twice). The code owns the board: the model synthesises rows from the
// collected basket; we render them.
export function buildBoardPrompt({ state, prompts, pack = DEFAULT_PACK }) {
  const basket = `## BASKET (חלופות שנאספו)\n${JSON.stringify(state.basket ?? [])}`;
  return [
    guidelines(prompts),
    text(prompts, 'board'),
    forbiddenBlock(prompts),
    basket,
    summarizeState(state, { pack, prompts }),
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
// explore a wound it is not told about); every user-facing builder gets it redacted,
// by the pack's barred slots.
// ── AN INTERVIEW WITHOUT THE REGISTRAR STILL REMEMBERS ──
// The probe sees the last LAST_K_TURNS messages and the coverage numbers. With the
// registrar on, the assembled event carries the rest of the story; with it off
// (`prompts.registrar === null`, the parents' interview) nothing did, and by the
// options stage the interviewer could no longer see the child's need it is meant to
// answer (prompt-editor, 16.10.2026). So such an interview gets the findings — the
// evaluator's short notes per slot, already in the person's own register — stage
// by stage. Redacted like the account: only the probe (`full`) sees the barred
// slots; the summary, the opener and the board, whose words reach the person,
// never do (eventView.js says why that polarity matters).
function renderFindings(state, { full, pack }) {
  const barred = barredSlots(pack);
  const out = [];
  for (const st of pack.stages) {
    const rows = Object.entries(state.findings?.[st.key] ?? {}).filter(
      ([slot, items]) => Array.isArray(items) && items.length && (full || !barred.has(slot))
    );
    if (!rows.length) continue;
    out.push(`### ${st.label}`);
    for (const [slot, items] of rows) out.push(`- ${slot}: ${items.join(' · ')}`);
  }
  return out.length ? `## מה נמסר עד עכשיו (hidden from user)\n${out.join('\n')}` : '';
}

function summarizeState(state, { full = false, pack, prompts } = {}) {
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
  const event = renderEvent(state, { full, pack });
  const remembered = prompts?.registrar === null ? renderFindings(state, { full, pack }) : '';

  return `${event ? `${event}\n\n` : ''}${remembered ? `${remembered}\n\n` : ''}## STATE SUMMARY (hidden from user)
stage: ${meta.currentStage}
questions_this_stage: ${meta.questionCount}
saturation: ${meta.saturationCount}
question_aperture: ${meta.questionAperture}
resistance: ${meta.resistanceFlag || 'none'}${threads}${actorMap}${openForks}${nodes}${edges}${groups}
coverage: ${JSON.stringify(coverage)}`;
}
