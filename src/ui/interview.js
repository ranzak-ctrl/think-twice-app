// The interview this shell runs — composed here, and only here.
//
// The engine imports no pack, no prompt and no model adapter (principle 4, see
// src/core/engine.js); this is where the browser build wires them together: the
// pack's structure, its texts as Vite loads them, and the adapter that calls the
// serverless proxy. Everything in the UI that drives the interview goes through
// this one object, so the interview is chosen in one place. (importState is the
// exception, and pack-agnostic: it restores a document, it routes nothing. Since
// 9.10.2026 exports record which interview and version they came from, and App's
// import handler loads only this interview at this version — see sessionExport.js.)
//
// One interview today. Choosing it per user at login is the shell's job in phase 4
// of docs/interview-platform-plan.md (§2א) — that will replace this constant with
// a choice, and nothing below the shell will need to know.

import { createEngine } from '../core/engine.js';
import { complete } from '../adapters/model.js';
import { thinkTwiceAdult } from '../packs/think-twice-adult/pack.js';
import { thinkTwiceAdultPrompts } from '../packs/think-twice-adult/prompts.js';

export const interview = createEngine({
  pack: thinkTwiceAdult,
  prompts: thinkTwiceAdultPrompts,
  complete,
});
