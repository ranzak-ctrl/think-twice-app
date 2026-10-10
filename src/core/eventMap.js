// The event record, projected to what the map draws.
//
// Ran, 18.9.2026: "אל תשאיר אותו מבוזר". The registrar is the sole writer of the
// graph, so `nodes` has to stop being a SECOND reported store of the same event
// standing beside the record — that would be three copies of one case and the
// scattering made worse, not better. The map becomes a RENDERING of the ledger,
// which is what Ran already ruled on 5.9.2026 ("הגרף מוביל, השלבים מנתבים") and
// what the correction of that day stopped short of: storyMap.js got its ORDER from
// the graph, and its CONTENTS still came from a store keyed by slot.
//
// Output shape is exactly what `state.nodes` holds — { id, label, slot, scale, seq }
// — so storyMap.js switches source in one line once the registrar is live. Until
// then the two coexist and this is dead code with tests around it, which is
// deliberate: flipping the map onto an empty record would blank the drawing.
//
// ── WHAT BECOMES A CUBE ──
// Beats, stances and emotions. NOT the setting: a place and a time are not things
// that happened, they are where and when the things happened, and the map already
// has a lane for standing conditions. The registrar's three entity kinds map onto
// the drawing's three columns — דמויות · פעולות · משמעות (Ran, 5.9.2026).
//
// ── THE DISPLAY GUARD IS APPLIED HERE, AND ONLY HERE ──
// The ledger stores the wound because coverage.stage2.wound cannot reach 2 without
// it, and the interviewer's account carries it because stage 2 cannot probe what it
// is not told. This is the projection where the pack's barred slots finally bite —
// `displayable()` is called on every entity, and that is the guard eventRecord.js
// exports so no projection has to remember the rule itself.

import { displayable, paceScale } from './eventRecord.js';
import { DEFAULT_PACK } from './pack.js';

// Fallback only. A cube is named by the registrar (`label`); trimming `text` is
// there so a cube is never empty, and it is visibly not the same thing — the same
// reasoning as `shorten` in storyMap.js, which this deliberately mirrors.
const FALLBACK_BUDGET = 20;
export function trimLabel(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= FALLBACK_BUDGET) return text;
  let out = '';
  for (const w of text.split(' ')) {
    if (out && (out + ' ' + w).length > FALLBACK_BUDGET) break;
    out = out ? `${out} ${w}` : w;
  }
  return out || text.slice(0, FALLBACK_BUDGET);
}

const nameOf = (e) => (e.label?.trim() ? e.label.trim() : trimLabel(e.text ?? e.name));

// An emotion's scale comes from its pace rather than from a field of its own: a
// situational feeling is a beat of the incident, a prior or trait one is the ground
// it ran on. One report, not two, and no way for the two to disagree.
const scaleOf = (e, kind) =>
  kind === 'emotion' ? paceScale(e.pace) : (e.scale === 'ongoing' ? 'ongoing' : 'episode');

// StateDocument → { [id]: { id, label, slot, scale, seq } }.
//
// Ids are namespaced per entity kind. The edge store already reserves `actor:` and
// `fork:` and treats a bare "stageN.slot" as a slot's own cube, so an unprefixed
// entity id could silently collide with one of those and steal its edges — the
// same class of fault that once crashed the map (state.js mergeNodes).
export function nodesFromRecord(state, pack = DEFAULT_PACK) {
  const record = state?.eventRecord;
  if (!record) return {};
  const out = {};
  let seq = 0;
  for (const [kind, store] of [
    ['beat', record.beats],
    ['stance', record.stances],
    ['emotion', record.emotions],
  ]) {
    for (const e of Object.values(store ?? {}).sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
      if (!displayable(e, pack)) continue; // the pack's barred slots stop here — the wound, the ADHD pattern
      const label = nameOf(e);
      if (!label) continue; // a cube with no name is not a cube
      out[`${kind}:${e.id}`] = { id: `${kind}:${e.id}`, label, slot: e.slot, scale: scaleOf(e, kind), seq: ++seq };
    }
  }
  return out;
}

// The endpoint name an edge uses for an entity, so the registrar's edges and this
// projection agree on one spelling. Exported rather than inlined because getting
// these two out of step is how an edge silently resolves to nothing.
export const endpointFor = (kind, id) => `${kind}:${id}`;
