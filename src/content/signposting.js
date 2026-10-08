// Signposting — verbal stage-transition messages (principle-zero §4.4).
// Positions the user on the map without asking "where to next?".
// Content, not code — the texts live in the interview pack (each stage's
// `signpost`), so Natali can revise them without touching logic. Used only as the
// fallback when a generated opener is unavailable.

import { DEFAULT_PACK, stageAt } from '../core/pack.js';

export function signpostForStage(stage, pack = DEFAULT_PACK) {
  return stageAt(pack, stage)?.signpost ?? 'נמשיך.';
}

// The map form, by stage number — for readers that list every signpost at once.
export const SIGNPOST = Object.fromEntries(
  DEFAULT_PACK.stages.map((s, i) => [i + 1, s.signpost]).filter(([, text]) => text)
);
