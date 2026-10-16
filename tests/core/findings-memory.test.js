// An interview without the registrar still remembers (promptBuilder.js,
// renderFindings; prompt-editor and router-guard, 16.10.2026). The interviewer
// must see in stage 6 the child's need it found in stage 4 — and the one thing
// only the parent may word, "which parent am I", must never reach a prompt whose
// words are spoken back to the parent.
//
// The parents' interview ran this way until it got its own registrar (Ran,
// 16.10.2026). The path stays for any interview that opts out with
// `registrar: null`, so it is tested on the parents' texts with the registrar
// taken out.

import { describe, it, expect } from 'vitest';
import { createState, addFindings } from '../../src/core/state.js';
import { buildSystemPrompt, buildSummaryPrompt, buildOpenerPrompt, buildBoardPrompt } from '../../src/core/promptBuilder.js';
import { thinkTwiceParents as pack } from '../../src/packs/think-twice-parents/pack.js';
import { thinkTwiceParentsPrompts } from '../../src/packs/think-twice-parents/prompts.js';
import { thinkTwiceAdultPrompts } from '../../src/packs/think-twice-adult/prompts.js';

const prompts = { ...thinkTwiceParentsPrompts, registrar: null };
const NEED = 'לדחות משימה שלא ברורה לו';
const SELF = 'אני אמא שלא מצליחה איתו';

function stateInStage6() {
  let s = createState(pack);
  s = addFindings(s, 'stage4', 'child_need', [NEED]);
  s = addFindings(s, 'stage5', 'parent_self', [SELF]);
  return { ...s, meta: { ...s.meta, currentStage: 6 } };
}

describe('the findings of an interview without the registrar', () => {
  it('reach the probe, stage by stage — the barred one included, which the probe needs', () => {
    const p = buildSystemPrompt({ stage: 6, state: stateInStage6(), prompts, pack });
    expect(p).toContain('## מה נמסר עד עכשיו');
    expect(p).toContain(NEED);
    expect(p).toContain(SELF);
  });

  it('never reach the summary, the opener or the board with the barred slot', () => {
    const state = stateInStage6();
    for (const p of [
      buildSummaryPrompt({ state, prompts, pack }),
      buildOpenerPrompt({ stage: 6, state, prompts, pack }),
      buildBoardPrompt({ state, prompts, pack }),
    ]) {
      expect(p).toContain(NEED);
      expect(p).not.toContain(SELF);
    }
  });

  it('are not how the parents’ interview remembers any more: it has its own registrar', () => {
    expect(typeof thinkTwiceParentsPrompts.registrar).toBe('string');
    const p = buildSystemPrompt({ stage: 6, state: stateInStage6(), prompts: thinkTwiceParentsPrompts, pack });
    expect(p).not.toContain('## מה נמסר עד עכשיו');
  });

  it('change nothing for an interview that has the registrar', () => {
    let s = createState();
    s = addFindings(s, 'stage1', 'trigger', ['ממצא שלא אמור להופיע']);
    const p = buildSystemPrompt({ stage: 1, state: s, prompts: thinkTwiceAdultPrompts });
    expect(p).not.toContain('## מה נמסר עד עכשיו');
    expect(p).not.toContain('ממצא שלא אמור להופיע');
  });
});
