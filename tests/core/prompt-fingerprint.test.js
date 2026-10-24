// Prompt fingerprints — the guard for the engine/pack split.
//
// docs/interview-platform-plan.md, phase 1: Think Twice's configuration moves out
// of the core and into a pack, and the exit condition is that THE ASSEMBLED
// PROMPTS DO NOT CHANGE BY ONE BYTE. Routing is covered by the transition matrix;
// this covers the other half of what the model sees. A reordered block, a lost
// separator or a stage prompt wired to the wrong stage all change a hash here,
// while every behavioural test can stay green.
//
// Hashes, not the texts: the probe prompt alone is ~100KB per stage. When one of
// these fails, the change is real — diff the assembled prompt before and after
// rather than updating the snapshot. Updating it is correct only when a prompt
// was changed on purpose (prompt-editor, then golden scripts + judge).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { SUMMARY_NUDGE, OPENER_NUDGE } from '../../src/core/promptBuilder.js';
// Composed the way the app composes them: the pack's texts, injected.
import {
  buildSystemPromptParts,
  buildRegistrarPrompt,
  buildSummaryPrompt,
  buildOpenerPrompt,
  buildBoardPrompt,
} from '../helpers/engine.js';
import {
  createState,
  mergeActorMap,
  mergeNodes,
  mergeEdges,
  mergeGroups,
  mergeOpenForks,
  addFindings,
} from '../../src/core/state.js';
import { mergeBeats, mergeStances, mergeEmotions, mergeSetting } from '../../src/core/eventRecord.js';
import { signpostForStage } from '../../src/content/signposting.js';

const fp = (text) =>
  typeof text === 'string'
    ? `${text.length}:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`
    : `<${typeof text}>`;

const parts = (p) => (typeof p === 'string' ? fp(p) : { stable: fp(p.stable), volatile: fp(p.volatile) });

// Every branch summarizeState and renderEvent can take: cast, forks, nodes, edges,
// groups, saved threads, findings, and a ledger that holds a wound — so the
// redacted and the full account differ, and both are pinned.
function richState() {
  let s = createState();
  s = mergeActorMap(s, [
    { id: 'supplier', label: 'הספק', role: 'מביא את הבשר', relation: 'ספק', clear: true },
    { id: 'chef', label: 'הסו-שף', role: 'עד', relation: 'עמית', clear: false },
  ]);
  s = mergeOpenForks(s, [{ id: 'f1', question: 'האם יחזור למשמרת?', options: ['כן', 'לא'] }]);
  s = mergeNodes(s, [
    { id: 'meat_bad', label: 'בשר לא איכותי', slot: 'stage1.trigger', scale: 'episode' },
    { id: 'kitchen', label: 'המטבח בלחץ', slot: 'stage2.causal', scale: 'ongoing' },
  ]);
  s = mergeEdges(s, [{ from: 'meat_bad', to: 'stage1.auto_reaction', kind: 'because', confirmed: true }]);
  s = mergeGroups(s, [
    { id: 'work', label: 'העבודה', kind: 'community', members: ['actor:supplier', 'actor:chef'] },
  ]);
  s = addFindings(s, 'stage1', 'trigger', ['הבשר הגיע לא באיכות שסוכמה']);
  let r = s.eventRecord;
  r = mergeSetting(r, { place: 'במטבח', time: 'באמצע המשמרת', conditions: ['לחץ קבוע'] });
  r = mergeBeats(r, [
    { id: 'b1', slot: 'stage1.trigger', actor: 'supplier', text: 'הביא בשר', camera: true, phase: 'during' },
    { id: 'b2', slot: 'stage1.auto_reaction', actor: 'self', text: 'עזב את המטבח', camera: true, phase: 'during' },
  ]);
  r = mergeStances(r, [
    { id: 's1', slot: 'stage2.causal', type: 'reading', actor: 'supplier', text: 'חשב שלא אשים לב', source: 'stated' },
    { id: 's2', slot: 'stage2.wound', type: 'reading', actor: 'self', text: 'אני לא מספיק טוב', source: 'stated' },
  ]);
  r = mergeEmotions(r, [
    { id: 'e1', slot: 'stage3.emotion', actor: 'self', name: 'עלבון', granular: true, intensity: 8 },
  ]);
  return {
    ...s,
    eventRecord: r,
    basket: [{ text: 'לדבר עם הספק מחר' }, { text: 'לחזור למשמרת' }],
    coverage: { ...s.coverage, stage1: { ...s.coverage.stage1, trigger: 2, timeline: 1, status: 'U' } },
    meta: {
      ...s.meta,
      questionCount: 4,
      saturationCount: 1,
      resistanceFlag: 'flight',
      questionAperture: 'closed',
      savedThreads: [{ topic: 'הבוס הקודם', stage: 1 }],
    },
  };
}

const atStage = (state, n) => ({ ...state, meta: { ...state.meta, currentStage: n } });
const STAGES = [1, 2, 3, 4, 5, 6, 7];

// Everything the model can read in this interview, by name — fresh and rich where
// the state reaches the prompt.
function everyPrompt() {
  const fresh = createState();
  const rich = richState();
  const out = {};
  for (const n of STAGES) {
    for (const [kind, state] of [['fresh', fresh], ['rich', rich]]) {
      const p = buildSystemPromptParts({ stage: n, state: atStage(state, n) });
      out[`probe.stage${n}.${kind}`] = `${p.stable}\n${p.volatile}`;
    }
    out[`opener.stage${n}`] = buildOpenerPrompt({ stage: n, state: atStage(rich, n) });
    out[`opener.stage${n}.reopen`] = buildOpenerPrompt({ stage: n, state: atStage(rich, n), situation: 'חזרה לשלב' });
  }
  for (const [kind, state] of [['fresh', fresh], ['rich', rich]]) {
    const r = buildRegistrarPrompt({ state });
    out[`registrar.${kind}`] = `${r.stable}\n${r.volatile}`;
  }
  out.summary = buildSummaryPrompt({ state: rich });
  out.board = buildBoardPrompt({ state: atStage(rich, 7) });
  return out;
}

describe('prompt fingerprints (engine/pack split must not move a byte)', () => {
  // Every text opens with a header the model must never read — its version line
  // and history (evaluator.md's runs to 57 lines). The pack's mapping strips it
  // (src/packs/text.js); until 24.10.2026 the adult mapping did not, and the
  // headers of evaluator, registrar, summary, opener and board reached the model.
  // The parents' test has had this assertion since 16.10.2026.
  it('no author note or any other comment reaches the model', () => {
    const all = everyPrompt();
    expect(Object.keys(all).length).toBe(STAGES.length * 4 + 4);
    for (const [name, text] of Object.entries(all)) {
      expect(text.includes('<!--'), `${name} carries a comment the model would read`).toBe(false);
    }
  });

  // A fingerprint of a state that never reaches the prompt pins nothing, so the
  // fixture proves it exercises the account and both sides of the redaction.
  it('the rich fixture reaches the account, redacted and full', () => {
    const rich = atStage(richState(), 2);
    const probe = buildSystemPromptParts({ stage: 2, state: rich }).volatile;
    expect(probe).toContain('במטבח');
    expect(probe).toContain('אני לא מספיק טוב');
    expect(buildSummaryPrompt({ state: rich })).not.toContain('אני לא מספיק טוב');
  });

  it('the probe prompt, every stage, empty and rich', () => {
    const out = {};
    for (const n of STAGES) {
      out[`stage${n}.fresh`] = parts(buildSystemPromptParts({ stage: n, state: atStage(createState(), n) }));
      out[`stage${n}.rich`] = parts(buildSystemPromptParts({ stage: n, state: atStage(richState(), n) }));
    }
    expect(out).toMatchSnapshot();
  });

  it('the registrar, summary, opener and board prompts', () => {
    const rich = richState();
    const out = {
      registrar: parts(buildRegistrarPrompt({ state: rich })),
      summary: fp(buildSummaryPrompt({ state: rich })),
      board: fp(buildBoardPrompt({ state: atStage(rich, 7) })),
    };
    for (const n of STAGES) {
      out[`opener.stage${n}`] = fp(buildOpenerPrompt({ stage: n, state: atStage(rich, n) }));
      out[`opener.stage${n}.reopen`] = fp(
        buildOpenerPrompt({ stage: n, state: atStage(rich, n), situation: 'חזרה לשלב' })
      );
    }
    expect(out).toMatchSnapshot();
  });

  it('the fixed texts: nudges and static signposts', () => {
    const out = { summaryNudge: fp(SUMMARY_NUDGE), openerNudge: fp(OPENER_NUDGE) };
    for (const n of [...STAGES, 8]) out[`signpost.${n}`] = fp(signpostForStage(n));
    expect(out).toMatchSnapshot();
  });

  it('the shape of a fresh StateDocument (key order reaches the prompt)', () => {
    expect(fp(JSON.stringify(createState()))).toMatchSnapshot();
  });
});
