// Story projection — the StateDocument rendered as a story the person can look at.
//
// Purpose (Ran, 28.8.2026): while the interview runs, show the case taking shape
// beside the chat. Two values, both stated in the request:
//
//   Clinical — it stops being a pile of details and becomes a story with a
//   beginning, a middle and an end. Cause and effect become visible, and the
//   person can look at their own case from the outside. design/brief.md:46 names
//   "order in the story" and "a clear mirror" as two of the four things this tool
//   gives, against the ruling/advice the person actually asks for.
//   design/brief.md:36 names בלבול נרטיבי — the story is not a story yet — as one
//   of the five states to assume on arrival. This is the answer to that state.
//
//   UX — it is proof the system understood correctly, early enough to be worth
//   correcting. The person reads the mirror, sees a detail that is off, and says
//   so in their next sentence. That is how ordinary conversation repairs itself.
//
// This module is the projection only: StateDocument in, display model out. Pure,
// no UI and no platform imports, so it stays inside CLAUDE.md principle 4 and is
// testable without a DOM. StoryPanel.jsx renders what comes out and adds nothing.
//
// ── THE ORDER IS THE ARGUMENT ──
// Scenes are not in stage order, they are in the order the story happened:
// event → thought → feeling → action. That is the chain the whole interview is
// built to expose, so the arrow between two boxes reads as "led to" — which is
// the cause and effect Ran asked to make visible. A person who never separated
// the interpretation from the event sees them as separate boxes here.
// Consequence: a scene appears the moment it has content, wherever it belongs in
// the chain, so the story REORGANISES as understanding deepens. During stage 1
// it reads מה קרה → מה עשית; when stage 2 lands, the interpretation slots in
// between them and the reaction stops looking like it followed the event
// directly. That re-ordering is the clinical point, not a side effect.
//
// ── FOUR HARD RULES, each from a written source. Read before editing. ──
//
// 1. Reflect CONTENT, never ASSESSMENT. design/brief.md:64 forbids evaluating
//    the person's input; :63 forbids completion meters; :65 forbids progress
//    pressure. So this reads `findings` (state.js calls it "Observability ONLY")
//    and `actorMap`, and NEVER `coverage`, `gaps` or saturation counters.
//    Corollary, and the reason empty scenes are dropped rather than greyed: a
//    column of empty boxes labelled with what is coming IS a completion meter —
//    it shows how much of them is still missing. The story only ever grows.
//
// 2. The wound is never mirrored. CLAUDE.md forbids formulating `wound` for the
//    person or reflecting it back as our interpretation — Natali's ruling of
//    14.8: he arrives at it himself, through directed questions. `adhd_pattern`
//    is likewise barred from appearing as a diagnosis. Both are excluded by
//    construction (NEVER_MIRROR, asserted in tests), not by whoever writes the
//    next scene list.
//
// 3. The cast is shown, its clarity is not. `actorMap` carries `clear:false` for
//    a character the interviewer is still disambiguating. That flag is the
//    stage-1 gate (state.js deriveActorsScore) and it is an assessment of what
//    the person said, so it stops here: the mirror shows who is in the story and
//    never marks one of them as a problem. Same reason `gaps` never appears —
//    gap-management.md §1 requires it stay invisible.
//
// 4. No new decision point. design/brief.md:68-73 allows exactly two in the whole
//    interview — summary confirmations and the stage-7 decision — and says that
//    if a new control appears anywhere it is a bug. So the projection carries no
//    actions and the panel has no buttons, no edit affordance, no dismiss. A
//    correction is made the way everything else is: the person says so, the next
//    evaluation updates findings, the mirror re-renders. The mirror is the
//    prompt; the chat is the only interface.

// Slots withheld from the mirror under rule 2. Enforced in linesFor, below the
// scene list, so adding a scene cannot re-admit them by accident.
export const NEVER_MIRROR = new Set(['wound', 'adhd_pattern']);

// The story, in the order it happened rather than the order it was collected.
// Each scene pulls findings from one or more [stage, slot] pairs; `auto_reaction`
// is collected in both stage 1 (as a fact) and stage 4 (in its own right), so the
// scene reads both and de-duplicates.
//
// Scope stops at stage 5. Stage 6 alternatives and the stage-7 decision are the
// decision board's, which has rules of its own (design/brief.md:62 — nothing may
// rank, star or pre-select an option). Mirroring the basket here would put the
// options on screen a second time, in a surface not built to hold them equally.
// The mirror is the case; the board is the choice.
//
// Titles are NOUNS, and must stay nouns. The stage rail is on the same screen and
// labels the process in questions — 'מה קרה', 'מה הרגשת', 'איך הגבת' (StageRail.jsx).
// The first draft of this list used the same phrasing and put 'מה קרה' on screen
// twice, once as where-you-are and once as a box of facts. A noun names a part of
// the story, a question names a step of the process; keeping the two apart is what
// stops the mirror from reading as a second progress indicator.
export const SCENES = [
  { key: 'event', title: 'האירוע', slots: [['stage1', 'trigger'], ['stage1', 'timeline'], ['stage1', 'status']] },
  { key: 'thought', title: 'המחשבה', slots: [['stage2', 'causal'], ['stage2', 'meaning']] },
  { key: 'feeling', title: 'הרגש', slots: [['stage3', 'emotion'], ['stage3', 'past_echo']] },
  { key: 'action', title: 'התגובה', slots: [['stage1', 'auto_reaction'], ['stage4', 'auto_reaction']] },
  { key: 'plan', title: 'מה שקלת לעשות', slots: [['stage4', 'planned_reaction']] },
  {
    key: 'angle',
    title: 'הצד השני',
    slots: [['stage5', 'perspective'], ['stage5', 'intention'], ['stage5', 'alt_formulation']],
  },
];

// Collect one scene's lines, de-duplicated, preserving first-seen order.
// Rule 2 is applied here rather than at the scene list so it holds for every
// scene that will ever exist.
function linesFor(findings, slots) {
  const out = [];
  const seen = new Set();
  for (const [stageKey, slot] of slots) {
    if (NEVER_MIRROR.has(slot)) continue;
    for (const item of findings?.[stageKey]?.[slot] ?? []) {
      if (typeof item !== 'string') continue;
      const line = item.trim();
      if (!line || seen.has(line)) continue;
      seen.add(line);
      out.push(line);
    }
  }
  return out;
}

// The person is addressed, never described. Models label the interviewee from the
// system's vocabulary — 'המשתמש' — and a mirror shown TO that person calling them
// "the user" is the system talking about them in the third person, over their
// shoulder, about the worst evening they have had this month. design/brief.md:66
// bars anything the cynic reads as condescension and this clears that bar easily.
// Matched on the whole trimmed label so a real character named in one of these
// words is untouched.
const SELF_LABELS = new Set(['המשתמש', 'משתמש', 'המרואיין', 'אני', 'עצמי', 'user']);
const SELF_ADDRESS = 'אתה';

// The cast, as characters rather than as a scorecard: no clarity badge, no count,
// no ordering by importance — that would be ranking the people in someone else's
// story (design/brief.md:62). Insertion order is the order they entered the telling.
//
// `relation` is deliberately not carried through. It exists so the INTERVIEWER can
// tell two characters apart ("אבא" the father vs. the person as a father — the
// stage-1 gate), and the person reading the mirror already knows who these people
// are to him; it is his story. Label and role are the whole cast entry.
//
// A character's `role` is often word-for-word one of their `actions` — the model
// fills 'role' with the thing they did ("אמר שהבשר לא איכותי") and then lists that
// same act. Printing both puts the sentence on screen twice and makes the mirror
// look like it is padding, which is the opposite of "this system understood me".
function buildCast(actorMap) {
  return Object.entries(actorMap ?? {})
    .map(([id, a]) => {
      const label = (a?.label ?? '').trim();
      const role = (a?.role ?? '').trim();
      return {
        id,
        label: SELF_LABELS.has(label) ? SELF_ADDRESS : label,
        role,
        actions: (a?.actions ?? [])
          .map((act) => (typeof act === 'string' ? act.trim() : ''))
          .filter((act) => act && act !== role),
      };
    })
    .filter((a) => a.label);
}

// StateDocument → { cast, scenes, isEmpty }. Only scenes that already have
// content are returned (rule 1), so the caller renders a story that grows and
// never a form with blanks in it.
export function buildStory(state) {
  const findings = state?.findings ?? {};
  const cast = buildCast(state?.actorMap);
  const scenes = SCENES.map(({ key, title, slots }) => ({
    key,
    title,
    lines: linesFor(findings, slots),
  })).filter((scene) => scene.lines.length > 0);

  return { cast, scenes, isEmpty: cast.length === 0 && scenes.length === 0 };
}
