// Prompt fingerprints — the parents' interview (Think Twice · הורים).
//
// The parents' counterpart of prompt-fingerprint.test.js: every prompt the parents'
// interview assembles, pinned byte for byte. A text reworded, a stage pointed at
// the wrong agent, the catalog appended to the wrong stage or a block lost from the
// guidelines all move a hash here — and nothing else would notice: there are no
// parents golden scripts yet, and the judge scores a fixed transcript.
//
// Hashes, not the texts. When one fails, the change is real — diff the assembled
// prompt before and after rather than updating the snapshot. Updating it is right
// only when a parents text or the mapping changed on purpose (prompt-editor), or
// a shared text the parents' interview reads did (guidelines/super.md, forbidden.js,
// and the builders themselves).
//
// Composed with the builders directly, the pack and the texts passed explicitly —
// the way session.js calls them for whichever interview the engine was given.
//
// The texts are a DRAFT FOR QA, awaiting Natali's approval (16.10.2026).

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildSystemPromptParts,
  buildRegistrarPrompt,
  buildSummaryPrompt,
  buildOpenerPrompt,
  buildBoardPrompt,
} from '../../src/core/promptBuilder.js';
import { createEngine } from '../../src/core/engine.js';
import { checkGuidelines } from '../../src/core/guidelines.js';
import { validatePrompts, slotIds } from '../../src/core/pack.js';
import { createState, addFindings } from '../../src/core/state.js';
import { thinkTwiceParents as pack } from '../../src/packs/think-twice-parents/pack.js';
import { thinkTwiceParentsPrompts as prompts } from '../../src/packs/think-twice-parents/prompts.js';
import { thinkTwiceAdultPrompts as adult } from '../../src/packs/think-twice-adult/prompts.js';
import { FORBIDDEN_PATTERNS } from '../../src/content/forbidden.js';
import {
  ADULT_JARGON_BAN,
  PARENTS_ADDITIONS,
} from '../../src/content/prompts/parents/forbidden.js';

const fp = (text) =>
  typeof text === 'string'
    ? `${text.length}:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`
    : `<${typeof text}>`;

const parts = (p) => (typeof p === 'string' ? fp(p) : { stable: fp(p.stable), volatile: fp(p.volatile) });

const STAGES = pack.stages.map((_, i) => i + 1);
const atStage = (state, n) => ({ ...state, meta: { ...state.meta, currentStage: n } });

const probe = (n, state) => buildSystemPromptParts({ stage: n, state, prompts, pack });
const opener = (n, state, situation) => buildOpenerPrompt({ stage: n, state, situation, prompts, pack });
const summary = (state) => buildSummaryPrompt({ state, prompts, pack });
const board = (state) => buildBoardPrompt({ state, prompts, pack });

// Every branch summarizeState takes for this interview: coverage under way, a
// basket, a saved thread, resistance and a closed aperture. No cast, nodes, edges or
// forks: this interview reports none (evaluator.md), and has no registrar.
function richState() {
  let s = createState(pack);
  s = addFindings(s, 'stage1', 'demand', ['ביקשת שיכין שיעורים בחשבון']);
  return {
    ...s,
    basket: [{ text: 'לשבת לידו בדקות הראשונות' }, { text: 'לשלוח אותו לחדר' }],
    coverage: {
      ...s.coverage,
      stage1: { ...s.coverage.stage1, demand: 2, child_behavior: 2, setting_events: 'U' },
      stage5: { ...s.coverage.stage5, parent_emotion: 1 },
    },
    meta: {
      ...s.meta,
      questionCount: 3,
      saturationCount: 1,
      resistanceFlag: 'overflow',
      questionAperture: 'open',
      savedThreads: [{ topic: 'בית הספר', stage: 2 }],
    },
  };
}

// Everything the model can read in this interview, by name.
function everyPrompt() {
  const rich = richState();
  const out = {};
  for (const n of STAGES) {
    const p = probe(n, atStage(rich, n));
    out[`probe.stage${n}`] = `${p.stable}\n${p.volatile}`;
    out[`opener.stage${n}`] = opener(n, atStage(rich, n));
    out[`opener.stage${n}.reopen`] = opener(n, atStage(rich, n), 'חזרה לשלב');
  }
  out.summary = summary(rich);
  out.board = board(atStage(rich, 7));
  return out;
}

describe('the parents interview composes', () => {
  it('createEngine accepts the pack and its texts, registrar null included', () => {
    expect(validatePrompts(pack, prompts)).toEqual({ ok: true, errors: [] });
    expect(checkGuidelines(prompts.guidelines).errors).toEqual([]);
    expect(() => createEngine({ pack, prompts, complete: async () => ({ ok: true, message: '' }) })).not.toThrow();
  });

  it('runs without the registrar: an explicit null, and no registrar call', () => {
    expect(prompts.registrar).toBeNull();
    expect(buildRegistrarPrompt({ state: createState(pack), prompts, pack })).toBe('');
  });

  it('no author note or any other comment reaches the model', () => {
    for (const [name, text] of Object.entries(everyPrompt())) {
      expect(text.includes('<!--'), `${name} carries a comment the model would read`).toBe(false);
    }
  });

  // The parents copies exist because the shared files do not fit; reusing one by
  // mistake would bring back "במה אתה בוחר?" and the jargon ban.
  it('summary, opener and board are the parents copies, not the shared files', () => {
    for (const k of ['summary', 'opener', 'board', 'evaluator', 'resistance']) {
      expect(prompts[k], k).not.toBe(adult[k]);
    }
    expect(prompts.guidelines.super).toBe(adult.guidelines.super);
  });

  it('the catalog rides with stages 3, 4, 6 and 8, and with no other', () => {
    const marker = '## ארגז הכלים: מאפיין ← צורך ← כלי';
    const carriers = STAGES.filter((n) => prompts.stages[`stage${n}`].includes(marker));
    expect(carriers).toEqual([3, 4, 6, 8]);
    for (const n of carriers) expect(prompts.stages[`stage${n}`].split(marker)).toHaveLength(2);
  });

  // A slot id the texts misspell is a slot the model never reports.
  it('every slot of the pack is named in its stage agent and in the evaluator', () => {
    for (const n of STAGES) {
      for (const id of slotIds(pack.stages[n - 1])) {
        expect(prompts.stages[`stage${n}`], `stage${n} agent does not name ${id}`).toContain(id);
        expect(prompts.evaluator, `evaluator does not name ${id}`).toContain(`\`${id}\``);
      }
    }
  });

  // This interview draws no story map and gates no cast, so the evaluator teaches
  // none of the fields that feed them.
  it('the evaluator asks for none of the story-map or cast fields', () => {
    for (const field of ['"nodes"', '"edges"', '"groups"', '"map_labels"', '"open_forks"', '"actor_map"', '"gap_observations"']) {
      expect(prompts.evaluator, field).not.toContain(field);
    }
  });

  // Ran, 9.10.2026: with parents professional terms are allowed — the jargon ban is
  // the adult model's. The filter in parents/forbidden.js matches the shared line by
  // exact text; this fails if that line is reworded and the ban slips back in.
  it('the blacklist: the shared list less the adult jargon ban, plus the parents additions', () => {
    expect(FORBIDDEN_PATTERNS).toContain(ADULT_JARGON_BAN);
    expect(prompts.forbidden).not.toContain(ADULT_JARGON_BAN);
    expect(prompts.forbidden).toEqual([
      ...FORBIDDEN_PATTERNS.filter((l) => l !== ADULT_JARGON_BAN),
      ...PARENTS_ADDITIONS,
    ]);
    expect(prompts.forbidden).toHaveLength(FORBIDDEN_PATTERNS.length - 1 + PARENTS_ADDITIONS.length);
  });

  it('the guidelines keep the locked one-question rule and drop the jargon ban', () => {
    const { text } = checkGuidelines(prompts.guidelines);
    expect(text).toContain('כל תשובה שלך מסתיימת בשאלה מכוונת אחת בדיוק');
    expect(text).not.toContain("אפס ז'רגון טיפולי");
    expect(text).toContain('אתה מראיין של Think Twice להורים');
  });
});

describe('prompt fingerprints — parents', () => {
  it('the probe prompt, every stage, empty and rich', () => {
    const out = {};
    for (const n of STAGES) {
      out[`stage${n}.fresh`] = parts(probe(n, atStage(createState(pack), n)));
      out[`stage${n}.rich`] = parts(probe(n, atStage(richState(), n)));
    }
    expect(out).toMatchSnapshot();
  });

  it('the summary, opener and board prompts', () => {
    const rich = richState();
    const out = {
      summary: fp(summary(rich)),
      board: fp(board(atStage(rich, 7))),
    };
    for (const n of STAGES) {
      out[`opener.stage${n}`] = fp(opener(n, atStage(rich, n)));
      out[`opener.stage${n}.reopen`] = fp(opener(n, atStage(rich, n), 'חזרה לשלב'));
    }
    expect(out).toMatchSnapshot();
  });

  it('the texts as mapped, one by one', () => {
    const out = {
      guidelinesSpecific: fp(prompts.guidelines.specific),
      resistance: fp(prompts.resistance),
      evaluator: fp(prompts.evaluator),
      summary: fp(prompts.summary),
      opener: fp(prompts.opener),
      board: fp(prompts.board),
      forbidden: fp(prompts.forbidden.join('\n')),
    };
    for (const n of STAGES) out[`stage${n}`] = fp(prompts.stages[`stage${n}`]);
    expect(out).toMatchSnapshot();
  });
});
