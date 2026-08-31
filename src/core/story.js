// Story projection — the case as a drawing, not as a summary.
//
// Purpose (Ran, 28.8.2026): while the interview runs, the case is sketched beside
// the chat — lines, boxes and arrows that fill in slowly as the story is told.
// Two values, both stated in the request:
//
//   Clinical — it stops being a pile of details and becomes a story with a
//   beginning, a middle and an end, one the person can look at from the outside
//   with cause and effect visible in it. design/brief.md:46 names "order in the
//   story" and "a clear mirror" as two of the four things this tool gives, and
//   :36 names בלבול נרטיבי — the story is not a story yet, it is a pile of
//   moments with no timeline — as a state to assume on arrival.
//
//   UX — it is proof the system understood correctly, early enough to be worth
//   correcting. The person looks at the drawing, sees a detail that is wrong, and
//   says so in their next sentence. That is how conversation repairs itself.
//
// WHY THE FIRST VERSION WAS REJECTED, so it is not rebuilt by accident: it printed
// every finding as a bullet under a stage heading, which made it "a summary of the
// story taking shape in words" (Ran, 28.8) rather than a picture. The lesson is in
// the shape of this module's output, not only in the CSS: it emits NODES — one
// short label each, typed by what kind of thing it is — because a projection that
// hands the UI paragraphs will always be rendered as paragraphs.
//
// This module is the projection only: StateDocument in, node list out. Pure, no UI
// and no platform imports, so it stays inside CLAUDE.md principle 4 and is testable
// without a DOM. StoryPanel.jsx draws what comes out and decides nothing.
//
// ── THE ORDER IS THE ARGUMENT ──
// Nodes are not in stage order, they are in the order the story happened:
// fact → thought → feeling → action. That is the chain the whole interview exists
// to expose, so an arrow between two nodes reads as "led to" — the cause and
// effect Ran asked to make visible. Consequence: a node appears the moment it has
// content, wherever it belongs in the chain, so the drawing REORGANISES as
// understanding deepens. During stage 1 it reads fact → action; when stage 2
// lands, the interpretation slots in between them and the reaction stops looking
// like it followed the event directly. That re-ordering is the clinical point.
//
// ── FOUR HARD RULES, each from a written source. Read before editing. ──
//
// 1. Reflect CONTENT, never ASSESSMENT. design/brief.md:64 forbids evaluating the
//    person's input; :63 forbids completion meters; :65 forbids progress pressure.
//    Nothing is drawn as an empty placeholder waiting to be filled: an outline of
//    the parts still missing is a completion meter with a pencil sketch over it.
//    `gaps` and the saturation counters are never read at all.
//    `coverage` MAY GATE, and may NEVER BE DISPLAYED — see CERTAINTY below. The
//    ban is on showing the person a verdict about what they said, not on the code
//    consulting its own confidence before it commits ink. A score that decides
//    whether a node is drawn yet shows nobody anything: the person cannot tell a
//    detail is being held back, only that what is on the paper is right.
//
// 2. The wound is never drawn. CLAUDE.md forbids formulating `wound` for the
//    person or reflecting it back as our interpretation — Natali's ruling of
//    14.8: he arrives at it himself, through directed questions. `adhd_pattern`
//    is likewise barred from appearing as a diagnosis. Both are excluded by
//    construction (NEVER_MIRROR, asserted in tests), not by whoever writes the
//    next entry in LAYERS.
//
// 3. The cast is shown, its clarity is not. `actorMap` carries `clear:false` for
//    a character the interviewer is still disambiguating. That flag is the
//    stage-1 gate (state.js deriveActorsScore) and an assessment of what the
//    person said, so it stops here. Same reason `gaps` never appears —
//    gap-management.md §1 requires it stay invisible.
//
// 4. No new decision point. design/brief.md:68-73 allows exactly two in the whole
//    interview and says that if a new control appears anywhere it is a bug. The
//    projection carries no actions; the drawing has no buttons and nothing to
//    click. A correction is made by saying so in the chat.

// Slots withheld from the drawing under rule 2. Enforced in the collector below,
// not in LAYERS, so it holds for every layer that will ever be added.
export const NEVER_MIRROR = new Set(['wound', 'adhd_pattern']);

// The story's chain, in the order it happened. `kind` is what the UI draws the
// node AS — the shapes differ because the things differ, and seeing that the
// interpretation is a different KIND of object from the event is most of the
// clinical work this picture does. A fact is a box; a thought is not.
//
// Scope stops at stage 5. Stage 6 alternatives and the stage-7 decision belong to
// the decision board, which has rules of its own (design/brief.md:62 — nothing may
// rank, star or pre-select an option). The drawing is the case; the board is the
// choice.
export const LAYERS = [
  { kind: 'fact', slots: [['stage1', 'trigger'], ['stage1', 'timeline'], ['stage1', 'status']] },
  { kind: 'thought', slots: [['stage2', 'causal'], ['stage2', 'meaning']] },
  { kind: 'feeling', slots: [['stage3', 'emotion'], ['stage3', 'past_echo']] },
  { kind: 'action', slots: [['stage1', 'auto_reaction'], ['stage4', 'auto_reaction']] },
  { kind: 'plan', slots: [['stage4', 'planned_reaction']] },
  {
    kind: 'other',
    slots: [['stage5', 'perspective'], ['stage5', 'intention'], ['stage5', 'alt_formulation']],
  },
];

// ── CERTAINTY (Ran, 28.8): "before adding an item, weigh how certain it is —
// maybe another question is needed first." ──
// The interview already grades exactly this, and the code does not have to invent
// a second opinion: the slot scale is 0 untouched / 1 partial or vague / 2 clear
// and corroborated / U legitimately unknown (transition-protocol §Slot). A finding
// is drawn only once ITS OWN slot stands at 2. So a detail mentioned in passing
// sits in `findings` unpublished while the interviewer keeps asking, and appears
// on the paper at the moment the interview itself calls it solid. Nothing about
// the score reaches the screen — the person sees fewer, firmer things.
//
// U is deliberately not enough. "He doesn't remember" is a legitimate final answer
// for the ROUTER, and a thing you cannot draw.
//
// An open fork is NOT an exception to this gate, though it looks like one. Natali,
// 29.8.2026: the EXISTENCE of the fork is itself a certain fact — the situation
// really was undecided — even though its branches are not. What is uncertain is
// which branch is true, and the drawing never claims one. So a fork is gated on
// having been reported with two or more branches, not on a slot score, because it
// does not come from a slot at all.
const CONFIRMED = 2;

// ── SIGNIFICANCE (Ran, 28.8): "is it structural, or a secondary detail?" ──
// ONE NODE PER SLOT. The slot list is not an arbitrary schema — it is the
// Transition Protocol's clinical answer to what a case is made of (trigger,
// timeline, status, causal, meaning, emotion, past echo, reaction...). So the
// structural elements of the story are exactly the confirmed slots, one shape
// each, and everything else the person said is detail that supports a shape
// without being one.
//
// This is what separates a drawing from the list it replaced. Drawing every
// finding put five boxes in a row for stage 1 alone, two of which were the same
// moment timestamped twice, and a column of twelve boxes is a list that has been
// given corners. The chain carries the sequence; a slot contributes one link.
//
// The node shows the LATEST finding in its slot, not the first. Findings only ever
// append (state.js addFindings), so the last one is the most recently confirmed
// wording — which means a correction, arriving later, replaces what is drawn
// instead of piling up beside it. That is the nearest thing to erasing a line that
// an append-only record allows.
//
// What the code still cannot do is rank two findings inside one slot on merit;
// "latest" is recency, not importance. Real significance has to come from the
// model saying so, which is a change to evaluator.md — prompt-editor's file, and
// Natali's wording. Filed as questions-for-natali.md §9.

// A node carries a label, not a sentence. Findings arrive as free text up to 140
// characters (state.js FINDING_MAX_LEN); at that length a node stops being a shape
// with a name on it and becomes a paragraph in a box, which is the failure mode
// this rebuild exists to fix. Long findings are trimmed at a word boundary.
const LABEL_MAX = 58;

function toLabel(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text.length <= LABEL_MAX) return text;
  const cut = text.slice(0, LABEL_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > LABEL_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

// The person is addressed, never described. Models label the interviewee from the
// system's vocabulary — 'המשתמש' — and a drawing shown TO that person calling them
// "the user" is the system talking about them in the third person, over their
// shoulder, about the worst evening they have had this month. design/brief.md:66
// bars anything the cynic reads as condescension. Matched on the whole trimmed
// label so a real character named in one of these words is untouched.
const SELF_LABELS = new Set(['המשתמש', 'משתמש', 'המרואיין', 'אני', 'עצמי', 'user']);
const SELF_ADDRESS = 'אתה';

// The cast is NAMES ONLY — who is in this story, nothing else.
//
// The first version drew each character as a card carrying role, relation and a
// list of their actions, and a live run turned it into the densest block on the
// screen: five cards for four people, 'אתה — מספר הסיפור', and every action
// printed twice because the model fills `role` with a thing the character did and
// then lists that same thing under `actions`. What a character DID belongs to the
// beat where it happened, on the chain; up here it is noise competing with the
// drawing. Roles and relations exist so the INTERVIEWER can tell two characters
// apart — the person reading this already knows who these people are to him.
function buildCast(actorMap) {
  const seen = new Set();
  const out = [];
  for (const [id, a] of Object.entries(actorMap ?? {})) {
    const raw = (a?.label ?? '').trim();
    if (!raw) continue;
    const label = SELF_LABELS.has(raw) ? SELF_ADDRESS : raw;
    if (seen.has(label)) continue; // two ids, one name — draw the person once
    seen.add(label);
    out.push({ id, label });
  }
  return out;
}

// StateDocument → { cast, nodes, isEmpty }.
//
// One node per finding, de-duplicated across the whole chain: the drawing fills in
// as understanding does, one shape per thing understood, which is what Ran asked
// for. De-duplication is global rather than per layer because the same fact is
// genuinely reported twice — stage 4 revisits the reaction stage 1 already
// recorded — and drawing it twice would say the person did it twice.
export function buildStory(state) {
  const findings = state?.findings ?? {};
  const coverage = state?.coverage ?? {};
  const cast = buildCast(state?.actorMap);
  const nodes = [];
  const seen = new Set();

  for (const { kind, slots } of LAYERS) {
    for (const [stageKey, slot] of slots) {
      if (NEVER_MIRROR.has(slot)) continue;
      if (coverage?.[stageKey]?.[slot] !== CONFIRMED) continue; // not solid yet
      const items = findings?.[stageKey]?.[slot] ?? [];
      let label = '';
      for (let i = items.length - 1; i >= 0 && !label; i--) {
        if (typeof items[i] === 'string') label = toLabel(items[i]);
      }
      if (!label || seen.has(label)) continue;
      seen.add(label);
      // The id is the slot itself, never the node's index in the finished chain:
      // a node that keeps its identity when an earlier layer lands in front of it
      // is a node that does not get redrawn and re-animated.
      nodes.push({ id: `${stageKey}.${slot}`, kind, text: label });
    }
  }

  // Open forks sit at the end of the facts, before the interpretation: they ARE
  // facts, and the chain then reads "this was still undecided → and this is what
  // was done while it was" — which, in the run this came from, is the injury.
  //
  // A settled fork leaves the drawing rather than staying with a tick. Once the
  // world decided it, it is not a fork; what was decided arrives as an ordinary
  // finding in its slot. Drawing a resolved question next to the resolved answer
  // would be the system showing its own working, which is what `gaps` is for and
  // what `gaps` is forbidden to do.
  const forks = Object.values(state?.openForks ?? {})
    .filter((f) => f && !f.settled && f.question && (f.options?.length ?? 0) >= 2)
    .map((f) => ({
      id: `fork.${f.id}`,
      kind: 'fork',
      text: f.question,
      options: [...f.options],
    }));

  if (forks.length) {
    const afterFacts = nodes.findIndex((n) => n.kind !== 'fact');
    nodes.splice(afterFacts === -1 ? nodes.length : afterFacts, 0, ...forks);
  }

  return { cast, nodes, isEmpty: cast.length === 0 && nodes.length === 0 };
}
