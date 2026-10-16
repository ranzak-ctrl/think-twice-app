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
//
// The registrar (prompt-editor, 16.10.2026, after Ran approved the parents
// registrar model): until then this interview ran with `registrar: null`, and the
// interviewer remembered through the evaluator's findings ("מה נמסר עד עכשיו"). Now
// it has its own registrar text, so the findings memory goes quiet and the
// registrar's account of the event ("המאורע כפי שנאסף עד כה") takes its place —
// the fixture below carries a record so that account, redacted and full, is pinned.

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
import {
  createState,
  addFindings,
  mergeActorMap,
  mergeEdges,
  mergeOpenForks,
} from '../../src/core/state.js';
import { mergeBeats, mergeStances, mergeEmotions, mergeSetting } from '../../src/core/eventRecord.js';
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
const registrar = (state) => buildRegistrarPrompt({ state, prompts, pack });

// What only the parent may word ("which parent am I") and what the account says
// about the scene, in the fixture below.
const PARENT_SELF = 'אמרת לעצמך שאת אמא גרועה';
const PLACE = 'ליד שולחן המטבח';

// Every branch summarizeState and renderEvent take for this interview: coverage
// under way, a basket, a saved thread, resistance and a closed aperture — and,
// since it has a registrar, a record: the setting, beats of the parent and of the
// child, the parent's thought, the child's need, a feeling, a cast with an unclear
// character, an edge and a fork. The record holds a `parent_self` stance, so the
// redacted account (summary, opener, board) and the full one (probe, registrar)
// differ, and both are pinned. The finding stays: the evaluator still reports
// findings, and with a registrar they must no longer reach a prompt.
function richState() {
  let s = createState(pack);
  s = addFindings(s, 'stage1', 'demand', ['ביקשת שיכין שיעורים בחשבון']);
  s = mergeActorMap(s, [
    { id: 'self', label: 'את/ה', role: 'ההורה', clear: true },
    { id: 'yoav', label: 'יואב', role: 'הילד', relation: 'הבן שלך, בן 10', clear: true },
    { id: 'abba', label: 'אבא', clear: false },
  ]);
  s = mergeOpenForks(s, [{ id: 'f1', question: 'לא הוכרע אם המורה תיתן לו דחייה', options: ['נבחן מחר', 'דחייה'] }]);
  s = mergeEdges(s, [{ from: 'stance:dodging', to: 'beat:b2', kind: 'about', confirmed: true }], pack);
  let r = s.eventRecord;
  r = mergeSetting(r, { place: PLACE, time: 'בשש בערב', conditions: ['מבחן מחר'] });
  r = mergeBeats(
    r,
    [
      { id: 'b1', slot: 'stage1.demand', actor: 'self', text: 'ביקשת שיתחיל את השיעורים', camera: true, phase: 'before' },
      { id: 'b2', slot: 'stage1.child_behavior', actor: 'yoav', text: 'ישב ובהה בדף', camera: true, phase: 'during' },
    ],
    pack,
  );
  r = mergeStances(
    r,
    [
      { id: 'dodging', slot: 'stage5.parent_thought_then', type: 'reading', actor: 'self', text: 'חשבת שהוא מתחמק', source: 'stated' },
      { id: 'ps', slot: 'stage5.parent_self', type: 'reading', actor: 'self', text: PARENT_SELF, source: 'stated' },
      {
        id: 'need',
        slot: 'stage4.child_need',
        type: 'want',
        actor: 'yoav',
        text: 'הוא היה צריך לדעת מאיפה להתחיל',
        source: 'attributed',
        third_person: true,
      },
    ],
    pack,
  );
  r = mergeEmotions(r, [{ id: 'anger', slot: 'stage5.parent_emotion', actor: 'self', name: 'כעס', granular: true, intensity: 8 }], pack);
  return {
    ...s,
    eventRecord: r,
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
  const reg = registrar(rich);
  out.registrar = `${reg.stable}\n${reg.volatile}`;
  return out;
}

describe('the parents interview composes', () => {
  it('createEngine accepts the pack and its texts, its own registrar included', () => {
    expect(validatePrompts(pack, prompts)).toEqual({ ok: true, errors: [] });
    expect(checkGuidelines(prompts.guidelines).errors).toEqual([]);
    expect(() => createEngine({ pack, prompts, complete: async () => ({ ok: true, message: '' }) })).not.toThrow();
  });

  // Ran approved the parents registrar on 16.10.2026; until then this was null.
  it('runs with its own registrar: a text of its own, and a registrar call', () => {
    expect(typeof prompts.registrar).toBe('string');
    expect(prompts.registrar).not.toBe(adult.registrar);
    const p = registrar(createState(pack));
    expect(p.stable).toBe(prompts.registrar);
    expect(typeof p.volatile).toBe('string');
  });

  // A fingerprint of a state that never reaches the prompt pins nothing, so the
  // fixture proves it exercises the account, both sides of the redaction, and the
  // findings memory going quiet.
  it('the rich fixture reaches the account, redacted and full — and the findings memory is gone', () => {
    const rich = richState();
    const probeText = buildSystemPromptParts({ stage: 5, state: atStage(rich, 5), prompts, pack }).volatile;
    expect(probeText).toContain('## המאורע כפי שנאסף עד כה');
    expect(probeText).toContain(PLACE);
    expect(probeText).toContain(PARENT_SELF);
    expect(registrar(rich).volatile).toContain(PARENT_SELF);
    for (const p of [summary(rich), opener(5, atStage(rich, 5)), board(atStage(rich, 7))]) {
      expect(p).toContain(PLACE);
      expect(p).not.toContain(PARENT_SELF);
    }
    for (const [name, text] of Object.entries(everyPrompt())) {
      expect(text.includes('## מה נמסר עד עכשיו'), `${name} still renders the findings memory`).toBe(false);
    }
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
  it('every slot of the pack is named in its stage agent, in the evaluator and in the registrar', () => {
    for (const n of STAGES) {
      for (const id of slotIds(pack.stages[n - 1])) {
        expect(prompts.stages[`stage${n}`], `stage${n} agent does not name ${id}`).toContain(id);
        expect(prompts.evaluator, `evaluator does not name ${id}`).toContain(`\`${id}\``);
        expect(prompts.registrar, `registrar does not name ${id}`).toContain(`\`${id}\``);
      }
    }
  });

  // The parents registrar was written from the adult one. A "stageN.slot" left over
  // from it ("stage2.wound", "stage1.trigger") still parses — eventRecord.js checks
  // only that N is a stage of the pack — so the model would file entities under a
  // slot this interview does not have, and nothing would notice.
  it('every "stageN.slot" the registrar teaches is a slot of this pack', () => {
    const known = new Set(pack.stages.flatMap((st, i) => slotIds(st).map((id) => `stage${i + 1}.${id}`)));
    const taught = [...prompts.registrar.matchAll(/stage\d+\.[a-z_]+/g)].map((m) => m[0]);
    expect(taught.length).toBeGreaterThan(0);
    expect(taught.filter((ref) => !known.has(ref))).toEqual([]);
  });

  // The evaluator still teaches none of the story-map or cast fields: the drawing is
  // made from the registrar's record (pack.js `map`), and the cast, edges, groups,
  // forks and contradictions are the registrar's to report — never both.
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

  it('the registrar prompt', () => {
    expect({
      fresh: parts(registrar(createState(pack))),
      rich: parts(registrar(richState())),
    }).toMatchSnapshot();
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
      registrar: fp(prompts.registrar),
      summary: fp(prompts.summary),
      opener: fp(prompts.opener),
      board: fp(prompts.board),
      forbidden: fp(prompts.forbidden.join('\n')),
    };
    for (const n of STAGES) out[`stage${n}`] = fp(prompts.stages[`stage${n}`]);
    expect(out).toMatchSnapshot();
  });
});
