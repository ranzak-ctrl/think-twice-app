// The engine — one interview, composed.
//
// docs/interview-platform-plan.md: the engine is the craft of interviewing; the
// pack is the professional model of one interview. createEngine binds the two,
// with a model adapter, into the object a shell runs an interview through:
//
//   pack      the interview's structure, as data   (src/packs/<id>/pack.js)
//   prompts   the interview's texts                (shape: promptBuilder.js)
//   complete  the model call                       (adapters/model.js in the browser)
//
// Nothing here imports a prompt or an adapter (principle 4). The browser build
// composes in src/ui/interview.js; a test, a simulation or a server composes its
// own. The one pack the core still reaches on its own is the transitional
// DEFAULT_PACK in pack.js, which phase 2 of the plan removes. Two interviews are two engines — which one a person gets is
// the shell's decision (plan §2א), never the engine's.
//
// Refuses to build on a pack or texts it cannot run: a broken interview stops
// here, before anyone has typed a word, instead of mis-routing a real person.

import { validatePack, validatePrompts } from './pack.js';
import { REGISTRAR_ENABLED } from './promptBuilder.js';
import { checkGuidelines } from './guidelines.js';
import { createState } from './state.js';
import { route, confirmAndAdvance, rejectConfirmation } from './router.js';
import { runTurn, generateStageOpener } from './session.js';

export function createEngine({ pack, prompts, complete } = {}) {
  const packCheck = validatePack(pack);
  if (!packCheck.ok) {
    throw new Error(`createEngine: the pack cannot run — ${[...packCheck.errors, ...packCheck.limits].join('; ')}`);
  }
  const promptCheck = validatePrompts(pack, prompts);
  if (!promptCheck.ok) {
    throw new Error(`createEngine: the pack's texts are incomplete — ${promptCheck.errors.join('; ')}`);
  }
  // The super file and this interview's specific file must compose: nothing
  // locked overridden, nothing required missing, no stray text outside a block.
  const g = checkGuidelines(prompts.guidelines);
  if (!g.ok) {
    throw new Error(`createEngine: the interviewer's guidelines do not compose — ${g.errors.join('; ')}`);
  }
  // Conditional on the switch, which is why it is checked here and not in pack.js:
  // with the registrar on, every turn starts with its call.
  if (REGISTRAR_ENABLED && (typeof prompts.registrar !== 'string' || !prompts.registrar.trim())) {
    throw new Error('createEngine: the registrar is switched on and the pack has no registrar text');
  }
  if (typeof complete !== 'function') {
    throw new Error('createEngine: `complete` (the model call) is required');
  }

  const deps = { pack, prompts, complete };
  return {
    pack,
    prompts,
    createState: () => createState(pack),
    route: (state) => route(state, pack),
    confirmAndAdvance: (state) => confirmAndAdvance(state),
    rejectConfirmation: (state) => rejectConfirmation(state, pack),
    runTurn: (state, history, userText) => runTurn(state, history, userText, deps),
    generateStageOpener: (state, history, opts) => generateStageOpener(state, history, opts, deps),
  };
}
