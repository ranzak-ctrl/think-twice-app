// The story as a MAP — redrawn whole on every new piece of information.
//
// Ran, 4.9.2026, replacing the growing-chain model: "I don't want a developing
// diagram of the story. It's a MAP of the story, and the map is re-created with
// every new item the interviewee gives. The new map absorbs the new detail into
// itself." His example is the specification:
//
//   At first the map holds an event, a place and characters. Then TIMING arrives
//   and another character — so the map is RE-CREATED in a form that represents the
//   time dimension, with the new character added to it.
//
// So the map's FORM is not fixed. What changes when new information lands is not
// only the contents but the shape of the drawing: before a timeline exists there is
// nothing to lay a path along, and the map is a place with people at it; once the
// order of events is known the same material re-forms as a route. That re-forming
// IS the feature — a person watching their own case acquire a shape is the point,
// per design/brief.md:36 (בלבול נרטיבי — "a pile of moments with no timeline").
//
// This module decides the form and the contents. StoryMap.jsx draws them and
// decides nothing, so a new form is a change in one place.
//
// THE TWO RULES from Ran, 28.8, one of them revised on 5.9:
//   certainty     — a WEIGHT, not a gate. Score 2 draws firm, 1 draws provisional,
//                   0 and U do not draw. It was a gate until 5.9.2026 and that was
//                   wrong: a conversation is not a linear axis, material belonging
//                   to stage 3 routinely surfaces in stage 1, and the interview
//                   already captures it — the cross-stage key records the emotion,
//                   the finding and the label are stored, the slot is seeded so it
//                   is waiting when the interview arrives. The map then refused to
//                   draw it, so the person told the system something and watched it
//                   vanish. Ran: "even if material belonging to later stages comes
//                   up in slot 1, it is not ignored — it is represented in the
//                   diagram, and it populates the slot we reach later, which may
//                   shorten that inquiry and which deeper inquiry may update."
//                   Nothing understood is hidden; nothing half-understood is drawn
//                   as settled, which is what the original rule was protecting. U
//                   stays out: "he doesn't remember" is a valid final answer for
//                   the Router and still not a thing you can draw.
//   significance  — one map element per slot. The Transition Protocol's slot list
//                   is the clinical answer to what a case is made of.
// And the exclusions are unchanged: never the wound, never the ADHD pattern, never
// a character's clarity flag, never `gaps`. See story.js for the full reasoning;
// this module imports them rather than restating them.
//
// LABELS. Ran asked for "cubes, a word or two in each" (4.9.2026). A cube's name
// comes from the model, as `mapLabels` — because choosing WHAT a cube stands for
// ("מודעה פורסמה") is a judgement, and no amount of code turns a sentence into one.
// `shorten` is the fallback for a slot the model has not named yet: it truncates,
// which is visibly not the same thing, and is there so a cube is never empty rather
// than because it is good.

import { NEVER_MIRROR, buildCast } from './story.js';

const CONFIRMED = 2;
const PROVISIONAL = 1;

// Fallback only — see LABELS above. Takes the first words up to a budget,
// preferring a clean word boundary.
const LABEL_BUDGET = 20;
export function shorten(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= LABEL_BUDGET) return text;
  const words = text.split(' ');
  let out = '';
  for (const w of words) {
    if (out && (out + ' ' + w).length > LABEL_BUDGET) break;
    out = out ? `${out} ${w}` : w;
  }
  return out || text.slice(0, LABEL_BUDGET);
}

// The stations of the route, in the order the story happened. Same chain as before
// — event, interpretation, feeling, what was done — because that is what the
// interview exists to expose and what makes a route out of a pile of moments.
const STATIONS = [
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

// → { label, provisional } for a slot worth drawing, or null. See the certainty
// rule in the header. Latest finding rather than first, so a correction replaces
// what is drawn instead of piling up beside it.
function slotCube(state, stageKey, slot) {
  if (NEVER_MIRROR.has(slot)) return null;
  const level = state?.coverage?.[stageKey]?.[slot];
  if (level !== CONFIRMED && level !== PROVISIONAL) return null;
  const provisional = level === PROVISIONAL;

  // The model's name for this cube, when it gave one. Preferred over anything
  // derived from the finding: the label is what the map is FOR.
  const named = state?.mapLabels?.[stageKey]?.[slot];
  if (typeof named === 'string' && named.trim()) return { label: named.trim(), provisional };

  // Otherwise fall back to trimming the latest finding, so the cube is not empty.
  // Latest rather than first, so a correction replaces what is drawn.
  const items = state?.findings?.[stageKey]?.[slot] ?? [];
  for (let i = items.length - 1; i >= 0; i--) {
    if (typeof items[i] === 'string' && items[i].trim()) {
      return { label: shorten(items[i]), provisional };
    }
  }
  return null;
}

// StateDocument → a map spec.
//
// `form` is the whole point of this module. 'scene' has no time in it: a place with
// people at it, which is all a story is before its order is known. 'journey' lays
// the same material along a route. The switch is the timeline slot being confirmed
// — literally Ran's "then timing arrives, so the map is re-created with a time
// dimension in it" — and when it flips, every element is placed again from scratch.
export function buildMap(state) {
  const cast = buildCast(state?.actorMap).map((a) => ({ ...a, label: shorten(a.label) }));

  const stations = [];
  const seen = new Set();
  for (const { kind, slots } of STATIONS) {
    for (const [stageKey, slot] of slots) {
      const cube = slotCube(state, stageKey, slot);
      if (!cube || seen.has(cube.label)) continue;
      seen.add(cube.label);
      stations.push({ id: `${stageKey}.${slot}`, kind, ...cube });
    }
  }

  // Unresolved forks — a fact of the case (Natali, 29.8), drawn as the route
  // splitting rather than as a station on it.
  const forks = Object.values(state?.openForks ?? {})
    .filter((f) => f && !f.settled && f.question && (f.options?.length ?? 0) >= 2)
    .map((f) => ({
      id: `fork.${f.id}`,
      label: shorten(f.question),
      options: f.options.map(shorten),
    }));

  // The links between consecutive stations, and WHERE EACH ONE COMES FROM.
  //
  // Ran's ruling of 5.9.2026 — the edges are the interviewee's — makes this the
  // honest part of the drawing. A link he actually stated is `sourced`; a link with
  // nothing behind it is the fixed STATIONS order asserting "led to" on its own
  // authority, which is what the ruling is against. Both are drawn for now, because
  // dropping the unsourced ones would leave a row of disconnected boxes until the
  // model starts reporting edges, but they are told apart: his arrows are drawn
  // firmly, ours tentatively. What SHOULD happen to an unconfirmed relation —
  // whether it blocks a stage the way an unclear character does — is the open
  // implementation question in questions-for-natali.md §10.
  const edges = Object.values(state?.edges ?? {});
  const links = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i].id;
    const b = stations[i + 1].id;
    const edge = edges.find(
      (e) => e.confirmed && ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
    );
    links.push({ from: i, to: i + 1, kind: edge?.kind ?? 'then', sourced: Boolean(edge) });
  }

  // A provisional timeline is still a time dimension — enough to lay a route along.
  const hasTime = [CONFIRMED, PROVISIONAL].includes(state?.coverage?.stage1?.timeline);
  const form = hasTime && stations.length >= 2 ? 'journey' : 'scene';

  return {
    form,
    cast,
    stations,
    links,
    forks,
    isEmpty: cast.length === 0 && stations.length === 0,
  };
}
