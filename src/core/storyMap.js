// The case as a GRAPH, and the map as a rendering of it.
//
// Ran, 5.9.2026, naming the dynamic this module had backwards: "with new
// information the GRAPH develops or updates, and the diagram follows. The stages
// are the narrative by which the Router steers the interview and makes sure no
// stage is left unanswered."
//
// Two things are separated by that sentence, and they were fused here:
//
//   the GRAPH   — nodes and the edges between them. The model of the case. It is
//                 what grows when the person says something, and the drawing is a
//                 rendering of it, nothing more.
//   the STAGES  — the Router's business. A checklist over the same material that
//                 guarantees no part of the interview goes unanswered. They are
//                 how the interview is STEERED, not how the story is SHAPED.
//
// This module used to derive the drawing's structure from the stage list, so the
// stages were silently doing the graph's job: the order of the boxes was the order
// of the protocol, and an arrow between two of them asserted "led to" on the
// authority of a hardcoded array. Now the order comes from the edges the person
// stated, and the stage order survives only as the FALLBACK for material he has
// not related yet — which is also why it is renamed NARRATIVE below.
//
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
//   significance  — a BUDGET, not one-cube-per-slot. It was the latter until
//                   5.9.2026, when Ran read a live map and said: "it started well
//                   but at some point you stopped creating cubes and only updated
//                   the existing ones." Nine separate things he had said about
//                   causality were one box whose name kept being overwritten,
//                   because the slot was standing in for the node — the same
//                   inversion as the ordering, in the one place it had not been
//                   corrected yet. The slot is what the ROUTER counts; a node is
//                   what the map draws, and a slot holds several. Which of the
//                   things he said earn one is the model's judgement, capped by
//                   NODES_PER_SLOT_MAX so the drawing stays readable.
// And the exclusions are unchanged: never the wound, never the ADHD pattern, never
// a character's clarity flag, never `gaps`. See story.js for the full reasoning;
// this module imports them rather than restating them.
//
// LABELS. Ran asked for "cubes, a word or two in each" (4.9.2026). A cube's name
// comes from the model, as `nodes` (or `mapLabels` for a slot's own cube) — because
// choosing WHAT a cube stands for
// ("מודעה פורסמה") is a judgement, and no amount of code turns a sentence into one.
// `shorten` is the fallback for a slot the model has not named yet: it truncates,
// which is visibly not the same thing, and is there so a cube is never empty rather
// than because it is good.

import { NEVER_MIRROR, buildCast } from './story.js';
// One definition of which edges may order, guarded by a test that also checks every
// other kind in the vocabulary stays out of it.
import { ORDERING_EDGE_KINDS as ORDERING_KINDS } from './vocabulary.js';

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

// The interview's narrative order — event, interpretation, feeling, what was done.
// This is the Router's spine, and here it is ONLY A FALLBACK: it gives a node its
// default position for as long as the person has not said what a thing led to.
// A confirmed edge always outranks it (see order() below), so as the graph fills
// in, this list has less and less say over the drawing.
const NARRATIVE = [
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

// Whether a slot is drawable at all, and how firmly. The certainty rule, in one
// place, so the slot's own cube and the extra nodes hanging off that slot cannot
// disagree about it.
function certaintyOf(state, slotId) {
  const m = /^stage([1-7])\.(.+)$/.exec(slotId ?? '');
  if (!m) return null;
  const [, digit, slot] = m;
  if (NEVER_MIRROR.has(slot)) return null;
  const level = state?.coverage?.[`stage${digit}`]?.[slot];
  if (level !== CONFIRMED && level !== PROVISIONAL) return null;
  return { provisional: level === PROVISIONAL };
}

// The narrative kind of a slot — what colour of thing it is (a fact, a thought, a
// feeling…) — and its default position, for as long as he has not said what led to
// what. Falls back to 'other' and to the end of the line for a slot NARRATIVE does
// not list, which is not an error: NARRATIVE is a default ordering, not the slot
// registry.
const SLOT_META = new Map(
  NARRATIVE.flatMap(({ kind, slots }) => slots.map(([st, sl]) => [`${st}.${sl}`, kind])).map(
    ([id, kind], rank) => [id, { kind, rank }],
  ),
);

const kindOf = (slotId) => SLOT_META.get(slotId)?.kind ?? 'other';
const rankOf = (slotId) => SLOT_META.get(slotId)?.rank ?? Number.MAX_SAFE_INTEGER;

// Every node the map will draw, in narrative order, before the graph re-orders them.
//
// Two sources, one list. On its own a slot contributes ONE cube, named by
// `mapLabels` or by a trimmed finding, under the id "stageN.slot" — the id the
// edges have always used, so nothing that already resolves stops resolving. But
// once the model reports nodes for that slot, THOSE are the slot's contents and the
// single fallback cube steps aside: nine things he said about causality are nine
// things, not one box whose name kept getting overwritten (Ran, 5.9.2026).
//
// A reported node whose id IS "stageN.slot" is the ordinary case of that — it
// simply names and scales the slot's own cube.
function nodesOf(state) {
  const reported = Object.values(state?.nodes ?? {})
    .filter((n) => certaintyOf(state, n.slot))
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const claimed = new Set(reported.map((n) => n.slot));

  const items = [];
  for (const { kind, slots } of NARRATIVE) {
    for (const [stageKey, slot] of slots) {
      const id = `${stageKey}.${slot}`;
      if (claimed.has(id)) continue; // the model named this slot's contents itself
      const cube = slotCube(state, stageKey, slot);
      if (cube) items.push({ id, kind, slot: id, scale: 'episode', seq: -1, ...cube });
    }
  }
  for (const n of reported) {
    items.push({
      id: n.id,
      kind: kindOf(n.slot),
      slot: n.slot,
      scale: n.scale === 'ongoing' ? 'ongoing' : 'episode',
      label: n.label,
      seq: n.seq ?? 0,
      ...certaintyOf(state, n.slot),
    });
  }

  // Narrative order across slots, and within one slot the order he said them in.
  items.sort((a, b) => rankOf(a.slot) - rankOf(b.slot) || a.seq - b.seq);

  // Two cubes reading the same words are one thing said twice, not two things.
  const labels = new Set();
  return items.filter((n) => {
    if (!n.label || labels.has(n.label)) return false;
    labels.add(n.label);
    return true;
  });
}

// StateDocument → a map spec.
//
// `form` is the whole point of this module. 'scene' has no time in it: a place with
// people at it, which is all a story is before its order is known. 'journey' lays
// the same material along a route. The switch is the timeline slot being confirmed
// — literally Ran's "then timing arrives, so the map is re-created with a time
// dimension in it" — and when it flips, every element is placed again from scratch.
//
// TWO CLOCKS, TWO LANES. Ran, 5.9.2026: "there is the order of events of the
// incident I am describing, and there is a description of something more ongoing in
// the relationship with my wife. We need to find a way to represent that
// complexity." So `stations` is the incident — beats in sequence, on the route —
// and `ground` is what stands underneath it and does not move: how things are, and
// have been. Nothing on the ground lane is ever given a position in the sequence,
// because it does not have one, and the arrows BETWEEN the lanes are the
// interesting part: "she has been trying to talk to me for a long time" is why she
// answered the way she did in that minute.
export function buildMap(state) {
  const cast = buildCast(state?.actorMap).map((a) => ({ ...a, label: shorten(a.label) }));
  const all = nodesOf(state);
  let stations = all.filter((n) => n.scale !== 'ongoing');
  const ground = all.filter((n) => n.scale === 'ongoing');

  // Unresolved forks — a fact of the case (Natali, 29.8), drawn as the route
  // splitting rather than as a station on it.
  const forks = Object.values(state?.openForks ?? {})
    .filter((f) => f && !f.settled && f.question && (f.options?.length ?? 0) >= 2)
    .map((f) => ({
      // Colon, matching the edge namespace state.js documents. It was a dot, so an
      // edge to a fork could never match its node and was dropped in silence.
      id: `fork:${f.id}`,
      label: shorten(f.question),
      options: f.options.map(shorten),
    }));

  // ── The graph decides the order; the narrative only breaks ties ──
  // A stable topological sort: every node starts at its narrative rank, each
  // confirmed `then`/`because` edge adds a real constraint, and among nodes that
  // are free to go next the lowest narrative rank wins. So a story the person has
  // related reads in HIS order, a story he has not still reads sensibly, and the
  // two mix without the drawing ever claiming a relation he did not state.
  //
  // Only the episode lane is ordered. An ongoing state has no place in a sequence,
  // so sorting it would be answering a question nobody asked.
  //
  // A cycle cannot deadlock this: whatever is still constrained when nothing is
  // free is emitted in narrative order. People do describe circular causes, and a
  // drawing that vanished because of one would be worse than a drawing that lays
  // it out flat.
  const rank = new Map(stations.map((n, i) => [n.id, i]));
  const indeg = new Map(stations.map((n) => [n.id, 0]));
  const out = new Map(stations.map((n) => [n.id, []]));
  const constrain = (from, to) => {
    if (!rank.has(from) || !rank.has(to) || from === to) return;
    out.get(from).push(to);
    indeg.set(to, indeg.get(to) + 1);
  };
  const stated = new Set();
  for (const e of Object.values(state?.edges ?? {})) {
    if (!e.confirmed) continue;
    // Only succession and causation constrain the order. `echo` (resemblance) and
    // `derives_from` (an alternative came out of a reinterpretation) are relations
    // that are NOT precedence — and a derivation does not happen in the story's
    // timeline at all, it happens in the interview. Listed by name so that adding a
    // kind to the vocabulary cannot silently give it ordering power.
    if (!ORDERING_KINDS.has(e.kind)) continue;
    constrain(e.from, e.to);
    // Both directions: what matters below is whether he said anything at all about
    // how these two stand to each other.
    stated.add(`${e.from}|${e.to}`);
    stated.add(`${e.to}|${e.from}`);
  }

  // Two cubes in ONE slot keep the order they were reported in — and that order
  // propagates, which is the point. Ran's run of 5.9.2026 put "נתנה עצות" two
  // places too early: he had said "אמרתי שחייב לנוח, אבל היא לא ויתרה… נתנה עצות",
  // and the model reported the edge into "לא ויתרה" but not the one into "נתנה
  // עצות". With nothing on it, that cube fell back to its SLOT's position in
  // NARRATIVE, where stage1.timeline sits ahead of stage1.auto_reaction — so the
  // map put her advice before he had asked for anything.
  //
  // Its sibling in the same slot was already pinned after his refusal by an edge he
  // did state. Chaining same-slot cubes in report order carries that pin onto the
  // one beside it, and the claim it makes is far weaker than the one it replaces:
  // "these two, which the model reported together, came in the order it gave them"
  // against "everything in this slot precedes everything in that one".
  //
  // It YIELDS to anything he said. A pair he has related is skipped entirely rather
  // than constrained both ways — adding the sibling edge on top of a contradicting
  // one of his makes a two-node cycle, and the cycle fallback then resolves it by
  // narrative rank, which is to say his stated order loses to the very default this
  // is here to correct. (Written the other way first, and the test below caught it.)
  // It is never drawn as one of his arrows either: nothing here reaches `links` or
  // `arcs`, so an inferred order stays a dashed line.
  const bySlot = new Map();
  for (const n of stations) {
    if (n.seq < 0) continue; // a slot's own fallback cube stands alone in its slot
    if (!bySlot.has(n.slot)) bySlot.set(n.slot, []);
    bySlot.get(n.slot).push(n);
  }
  for (const siblings of bySlot.values()) {
    const inOrder = [...siblings].sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < inOrder.length - 1; i++) {
      const [a, b] = [inOrder[i].id, inOrder[i + 1].id];
      if (stated.has(`${a}|${b}`)) continue;
      constrain(a, b);
    }
  }
  const ordered = [];
  const placed = new Set();
  while (ordered.length < stations.length) {
    const free = stations.filter((n) => !placed.has(n.id) && indeg.get(n.id) === 0);
    const next = (free.length ? free : stations.filter((n) => !placed.has(n.id)))
      .sort((a, b) => rank.get(a.id) - rank.get(b.id))[0];
    ordered.push(next);
    placed.add(next.id);
    for (const t of out.get(next.id)) indeg.set(t, indeg.get(t) - 1);
  }
  stations = ordered;

  // The links between consecutive stations, and WHERE EACH ONE COMES FROM.
  //
  // Ran's ruling of 5.9.2026 — the edges are the interviewee's — makes this the
  // honest part of the drawing. A link he actually stated is `sourced`; a link with
  // nothing behind it is the fixed NARRATIVE order asserting "led to" on its own
  // authority, which is what the ruling is against. Both are drawn for now, because
  // dropping the unsourced ones would leave a row of disconnected boxes until the
  // model starts reporting edges, but they are told apart: his arrows are drawn
  // firmly, ours tentatively.
  const edges = Object.values(state?.edges ?? {});
  const links = [];
  const drawnAsLink = new Set();
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i].id;
    const b = stations[i + 1].id;
    const edge = edges.find(
      (e) => e.confirmed && ((e.from === a && e.to === b) || (e.from === b && e.to === a)),
    );
    if (edge) drawnAsLink.add(edge.id);
    links.push({ from: i, to: i + 1, kind: edge?.kind ?? 'then', sourced: Boolean(edge) });
  }

  // ── Every other relation he stated, addressed BY ID ──
  //
  // This was three separate code paths — one for beats that ended up neighbours,
  // one for beats that did not, one for `agent` edges out of a character — and an
  // edge that fit none of the three was stored, sorted on, and drawn nowhere. Ran,
  // 5.9.2026, reading a live map: "relations are missing too. For example the
  // relation between my wife and the description of her character traits and the
  // description of her deeds." The state from that run held exactly one such edge,
  // `stage2.causal→actor:wife`, confirmed — a beat pointing AT a character, which
  // every one of the three paths dropped, because only beats had positions and only
  // a character could be the `from` of an agent edge.
  //
  // So there is one path now and an endpoint is any id the map places: a station, a
  // node on the ground lane, a character, an open fork. Whether a thing can be
  // pointed at is no longer a function of which array it happens to live in.
  const placedIds = new Set([
    ...stations.map((n) => n.id),
    ...ground.map((n) => n.id),
    ...cast.map((a) => `actor:${a.id}`),
    ...forks.map((f) => f.id),
  ]);
  const arcs = [];
  for (const e of edges) {
    // `echo` is drawn but deliberately absent from the ordering above: "this felt
    // like that" relates two beats without putting either first.
    if (!e.confirmed || !['then', 'because', 'agent', 'echo'].includes(e.kind)) continue;
    if (drawnAsLink.has(e.id)) continue; // already the chain link between two neighbours
    if (!placedIds.has(e.from) || !placedIds.has(e.to)) continue;
    arcs.push({ from: e.from, to: e.to, kind: e.kind });
  }

  // Where a character stands is decided by what he is joined to, so the cast list
  // carries the ids and the renderer does the geometry. `anchors` is every placed
  // thing this character has a confirmed relation to, whichever way the arrow runs
  // — being the object of a relation ("that is because of her") locates her on the
  // map exactly as much as being its subject does.
  const agents = cast.map((a) => {
    const self = `actor:${a.id}`;
    const anchors = new Set();
    for (const e of edges) {
      if (!e.confirmed) continue;
      if (e.from === self && placedIds.has(e.to) && e.to !== self) anchors.add(e.to);
      if (e.to === self && placedIds.has(e.from) && e.from !== self) anchors.add(e.from);
    }
    return { ...a, anchors: [...anchors] };
  });

  // Containers, resolved to the things they actually hold on this map. A group
  // whose members are all off the map contributes nothing rather than an empty box.
  const containers = [];
  for (const g of Object.values(state?.groups ?? {})) {
    // Only what he confirmed. A box is a claim, and an unconfirmed one is a
    // clarification waiting to happen, not a thing to draw at him.
    if (!g.confirmed) continue;
    const members = g.members.filter((m) => placedIds.has(m));
    if (members.length < 2) continue;
    containers.push({ ...g, members });
  }

  const hasTime = [CONFIRMED, PROVISIONAL].includes(state?.coverage?.stage1?.timeline);
  const form = hasTime && stations.length + ground.length >= 2 ? 'journey' : 'scene';

  return {
    form,
    cast,
    stations,
    ground,
    agents,
    containers,
    links,
    arcs,
    forks,
    isEmpty: cast.length === 0 && stations.length === 0 && ground.length === 0,
  };
}
