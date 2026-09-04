import { describe, it, expect } from 'vitest';
import { buildStory, LAYERS, NEVER_MIRROR } from '../../src/core/story.js';
import { buildMap } from '../../src/core/storyMap.js';
import {
  createState,
  addFindings,
  mergeActorMap,
  mergeOpenForks,
  setMapLabel,
  setSlot,
} from '../../src/core/state.js';

// The story mirror (src/core/story.js). These guard the rules in that file's
// header — each is a written clinical constraint, not a preference, so a change
// that trips one should fail the build rather than reach a tester.

// Findings are only drawn once their slot is confirmed (=2), so every fixture has
// to say so explicitly. That is the certainty gate, not test scaffolding.
function withFinding(state, stageKey, slot, items, score = 2) {
  return setSlot(addFindings(state, stageKey, slot, items), stageKey, slot, score);
}

const textsOf = (state) => buildStory(state).nodes.map((n) => n.text);

describe('story mirror — the clinical exclusions', () => {
  it('never draws the wound, even when it is confirmed and on record', () => {
    // CLAUDE.md: the person reaches the מוגלה himself. Reflecting it back as our
    // interpretation is forbidden — Natali, 14.8.2026.
    let s = withFinding(createState(), 'stage2', 'wound', ['אני לא שווה כלום']);
    s = withFinding(s, 'stage2', 'causal', ['חשבתי שהיא מזלזלת בי']);
    expect(textsOf(s)).toEqual(['חשבתי שהיא מזלזלת בי']);
  });

  it('never draws the ADHD pattern', () => {
    const s = withFinding(createState(), 'stage2', 'adhd_pattern', ['דפוס של קשב']);
    expect(buildStory(s).nodes).toEqual([]);
  });

  it('excludes the barred slots by construction, not by the layer list', () => {
    for (const layer of LAYERS) {
      for (const [, slot] of layer.slots) expect(NEVER_MIRROR.has(slot)).toBe(false);
    }
    expect([...NEVER_MIRROR]).toEqual(['wound', 'adhd_pattern']);
  });

  it('draws the cast as names, never a clarity flag or a role', () => {
    // `clear:false` is the stage-1 gate and an assessment of what the person said.
    // Roles and actions were what turned the first build's cast into a wall.
    const s = mergeActorMap(createState(), [
      { id: 'dad', label: 'אבא', role: 'התקשר', clear: false, actions: ['התקשר בערב'] },
    ]);
    expect(buildStory(s).cast).toEqual([{ id: 'dad', label: 'אבא' }]);
  });

  it('draws one person once when the model files them under two ids', () => {
    const s = mergeActorMap(createState(), [
      { id: 'wife', label: 'אשתך', actions: ['הודיעה'] },
      { id: 'partner', label: 'אשתך', actions: ['נשארה בים'] },
    ]);
    expect(buildStory(s).cast).toHaveLength(1);
  });

  it("addresses the person instead of calling them 'המשתמש'", () => {
    const s = mergeActorMap(createState(), [{ id: 'user', label: 'המשתמש', role: 'הטבח' }]);
    expect(buildStory(s).cast[0].label).toBe('אתה');
  });

  it('leaves a real character whose name resembles a self-label alone', () => {
    const s = mergeActorMap(createState(), [{ id: 'x', label: 'המשתמש בחנות' }]);
    expect(buildStory(s).cast[0].label).toBe('המשתמש בחנות');
  });

  it('reads nothing from gaps or the saturation counters', () => {
    let s = createState();
    s.gaps = { byTarget: { 'stage1.timeline': { level: 1, status: 'starred' } }, log: [] };
    s.meta.saturationCount = 2;
    expect(buildStory(s).isEmpty).toBe(true);
  });
});

describe('story mirror — certainty gate', () => {
  it('holds a finding back while its slot is still partial', () => {
    // Ran, 28.8: "how certain is the item — maybe another question is needed."
    // Score 1 = partial/vague; the interviewer is still working on it.
    const s = withFinding(createState(), 'stage1', 'trigger', ['אולי זה היה ביום שני'], 1);
    expect(buildStory(s).nodes).toEqual([]);
  });

  it('draws it once the same slot reaches 2', () => {
    let s = withFinding(createState(), 'stage1', 'trigger', ['הבשר הגיע למטבח'], 1);
    expect(buildStory(s).nodes).toEqual([]);
    s = setSlot(s, 'stage1', 'trigger', 2);
    expect(textsOf(s)).toEqual(['הבשר הגיע למטבח']);
  });

  it('does not draw a legitimately unknown slot', () => {
    // 'U' is a valid final answer for the Router and not a thing you can draw.
    const s = withFinding(createState(), 'stage1', 'timeline', ['הוא לא זוכר מתי'], 'U');
    expect(buildStory(s).nodes).toEqual([]);
  });
});

describe('story mirror — significance: one node per slot', () => {
  it('contributes one shape per confirmed slot, not one per finding', () => {
    // Drawing every finding is what made the first build a list with corners.
    const s = withFinding(createState(), 'stage1', 'timeline', [
      'בתחילת המשמרת',
      'כשהמשלוח הגיע',
      'אחרי שנאמר שהבשר לא איכותי',
    ]);
    expect(buildStory(s).nodes).toHaveLength(1);
  });

  it('shows the latest finding, so a correction replaces what is drawn', () => {
    // Findings only ever append, so recency is the nearest thing to an eraser.
    const s = withFinding(createState(), 'stage1', 'timeline', [
      'זה קרה ביום שני',
      'בעצם זה היה ביום שלישי',
    ]);
    expect(textsOf(s)).toEqual(['בעצם זה היה ביום שלישי']);
  });

  it('trims a long finding to a label at a word boundary', () => {
    const long = 'הוא אמר לי מול כל המטבח שהבשר שהזמנתי לא איכותי ושאני לא יודע לעשות את העבודה שלי';
    const [text] = textsOf(withFinding(createState(), 'stage1', 'trigger', [long]));
    expect(text.length).toBeLessThanOrEqual(60);
    expect(text.endsWith('…')).toBe(true);
    expect(text).not.toMatch(/\s…$/); // trimmed at a word, not mid-space
  });
});

describe('story mirror — the chain', () => {
  it('is empty on a fresh state, so nothing is drawn before the first answer', () => {
    expect(buildStory(createState()).isEmpty).toBe(true);
  });

  it('orders nodes as the story happened, not as the stages ran', () => {
    // fact → thought → feeling → action is the chain the arrows have to mean. The
    // reaction is recorded in stage 1, BEFORE the interpretation exists, and the
    // interpretation still lands in front of it.
    let s = withFinding(createState(), 'stage1', 'auto_reaction', ['צעקתי עליה']);
    s = withFinding(s, 'stage1', 'trigger', ['הודעה מהמורה']);
    s = withFinding(s, 'stage3', 'emotion', ['בושה']);
    s = withFinding(s, 'stage2', 'meaning', ['שאני אבא גרוע']);
    expect(buildStory(s).nodes.map((n) => n.kind)).toEqual([
      'fact',
      'thought',
      'feeling',
      'action',
    ]);
  });

  it('types every node so the UI can draw it as the right shape', () => {
    const kinds = new Set(LAYERS.map((l) => l.kind));
    expect(kinds).toEqual(new Set(['fact', 'thought', 'feeling', 'action', 'plan', 'other']));
  });

  it('gives a node an id that survives an earlier layer landing in front of it', () => {
    // A node that changes identity gets remounted, and re-animates. Stage 2
    // arriving must not make the stage-1 nodes redraw themselves.
    let s = withFinding(createState(), 'stage1', 'trigger', ['הודעה מהמורה']);
    const before = buildStory(s).nodes[0].id;
    s = withFinding(s, 'stage2', 'meaning', ['שאני אבא גרוע']);
    const after = buildStory(s).nodes.find((n) => n.kind === 'fact').id;
    expect(after).toBe(before);
  });

  it('draws the same fact once when two slots both carry it', () => {
    // Stage 4 revisits the reaction stage 1 already recorded; drawing it twice
    // would say the person did it twice.
    let s = withFinding(createState(), 'stage1', 'auto_reaction', ['יצאת בלי לומר מילה']);
    s = withFinding(s, 'stage4', 'auto_reaction', ['יצאת בלי לומר מילה']);
    expect(textsOf(s)).toEqual(['יצאת בלי לומר מילה']);
  });

  it('survives a partial or malformed state without throwing', () => {
    expect(buildStory(undefined).isEmpty).toBe(true);
    expect(buildStory({}).isEmpty).toBe(true);
    expect(buildStory({ findings: { stage1: { trigger: ['x'] } } }).nodes).toEqual([]); // no coverage
    expect(buildStory({ actorMap: { a: { label: '' }, b: { label: 'רומי' } } }).cast).toHaveLength(1);
  });
});

describe('story mirror — open forks (פיצולים לא-מוכרעים)', () => {
  // Natali, 29.8.2026: a question the STORY leaves open is a fact of the case, not
  // a gap in what the system knows. It is drawn; `gaps` never is.
  const withFork = (state, fork) => mergeOpenForks(state, [fork]);
  const FORK = {
    id: 'lead',
    question: 'לא הוכרע מי מנהל את הצוות',
    options: ['שניכם מנהלי מוצר במקביל', 'אתה מנהל הצוות', 'הוא מנהל את הצוות'],
  };

  it('draws the fork with its branches', () => {
    const node = buildStory(withFork(createState(), FORK)).nodes[0];
    expect(node.kind).toBe('fork');
    expect(node.text).toBe('לא הוכרע מי מנהל את הצוות');
    expect(node.options).toEqual(FORK.options);
  });

  it('does not wait for a slot score — the fork itself is the certain fact', () => {
    // The certainty gate holds findings back until their slot reaches 2. A fork has
    // no slot: what is certain is THAT it was undecided, not which branch is true.
    const s = withFork(createState(), FORK);
    expect(s.coverage.stage1.trigger).toBe(0);
    expect(buildStory(s).nodes).toHaveLength(1);
  });

  it('places the fork among the facts, before the interpretation', () => {
    // "this was still open → and this is what was done while it was" is the chain
    // the ruling came from; the fork has to sit before thought/feeling/action.
    let s = withFinding(createState(), 'stage1', 'trigger', ['מודעת דרושים פורסמה']);
    s = withFinding(s, 'stage2', 'meaning', ['שאני לא נחשב']);
    s = withFinding(s, 'stage1', 'auto_reaction', ['לא אמרת כלום']);
    s = withFork(s, FORK);
    expect(buildStory(s).nodes.map((n) => n.kind)).toEqual([
      'fact',
      'fork',
      'thought',
      'action',
    ]);
  });

  it('drops a fork the story went on to settle', () => {
    // Once the world decided it, it is not a fork; what was decided arrives as an
    // ordinary finding. Drawing a resolved question beside its answer would be the
    // system showing its working, which is what gaps is forbidden to do.
    let s = withFork(createState(), FORK);
    expect(buildStory(s).nodes).toHaveLength(1);
    s = mergeOpenForks(s, [{ id: 'lead', settled: true }]);
    expect(buildStory(s).nodes).toHaveLength(0);
    expect(s.openForks.lead.settled).toBe(true); // still on record for the export
  });

  it('refuses a one-branch fork — that is a fact, not a fork', () => {
    const s = withFork(createState(), { id: 'x', question: 'לא ברור', options: ['רק זה'] });
    expect(s.openForks).toEqual({});
    expect(buildStory(s).nodes).toHaveLength(0);
  });

  it('unions branches reported across turns without losing the question', () => {
    let s = withFork(createState(), { id: 'lead', question: 'מי מנהל', options: ['א', 'ב'] });
    s = mergeOpenForks(s, [{ id: 'lead', options: ['ב', 'ג'] }]); // delta, no question
    expect(s.openForks.lead.question).toBe('מי מנהל');
    expect(s.openForks.lead.options).toEqual(['א', 'ב', 'ג']);
  });

  it('never reads gaps as a fork — they are opposite things', () => {
    // A gap is an inconsistency in the telling and stays invisible forever
    // (gap-management.md §1). Only openForks reaches the drawing.
    let s = createState();
    s.gaps = { byTarget: { 'stage1.timeline': { level: 1, status: 'starred' } }, log: [] };
    expect(buildStory(s).nodes).toEqual([]);
    expect(buildStory(s).isEmpty).toBe(true);
  });
});

describe('open forks — the delta contract', () => {
  it('puts existing forks in the STATE SUMMARY so the model can reuse their id', async () => {
    // The prompt tells the model to omit an unchanged fork and to reuse its id.
    // It can only do that for a fork it can SEE. Without this the same open
    // question comes back under a new id every turn and is drawn again and again.
    const { buildSystemPrompt } = await import('../../src/core/promptBuilder.js');
    const s = mergeOpenForks(createState(), [
      { id: 'lead', question: 'לא הוכרע מי מנהל את הצוות', options: ['אתה', 'הוא'] },
    ]);
    const prompt = buildSystemPrompt({ stage: 1, state: s });
    // Assert on the STATE SUMMARY line, not the bare word: evaluator.md documents
    // the `open_forks` contract, so the name is in every prompt whether or not any
    // fork exists. The summary field is what the model reads its own state from.
    expect(prompt).toContain('\nopen_forks: ');
    expect(prompt).toContain('לא הוכרע מי מנהל את הצוות');
  });

  it('omits the key entirely when there are no forks', async () => {
    const { buildSystemPrompt } = await import('../../src/core/promptBuilder.js');
    expect(buildSystemPrompt({ stage: 1, state: createState() })).not.toContain('\nopen_forks: ');
  });
});

describe('story map — cube labels', () => {
  // Ran, 4.9.2026: "cubes, a word or two in each". Naming what a cube stands for
  // is a judgement, so the name comes from the model; truncation is the fallback.
  const long = 'המנהלת כבר פרסמה מודעת דרושים לתפקיד מנהל הצוות';
  const withTrigger = () =>
    setSlot(addFindings(createState(), 'stage1', 'trigger', [long]), 'stage1', 'trigger', 2);

  it("uses the model's label when it named the slot", () => {
    const s = setMapLabel(withTrigger(), 'stage1', 'trigger', 'מודעה פורסמה');
    expect(buildMap(s).stations[0].label).toBe('מודעה פורסמה');
  });

  it('falls back to trimming the finding when no label was given', () => {
    const label = buildMap(withTrigger()).stations[0].label;
    expect(label.length).toBeLessThan(long.length);
    expect(long.startsWith(label)).toBe(true); // visibly a prefix, not a name
  });

  it('replaces the label when a later turn renames the slot', () => {
    let s = setMapLabel(withTrigger(), 'stage1', 'trigger', 'מודעה פורסמה');
    s = setMapLabel(s, 'stage1', 'trigger', 'מודעה לתפקיד שלך');
    expect(buildMap(s).stations[0].label).toBe('מודעה לתפקיד שלך');
  });

  it('refuses a label that is really a sentence rather than trimming it', () => {
    // Trimming would put the sentence back in the cube this field exists to
    // keep out, and would do it silently.
    const s = setMapLabel(withTrigger(), 'stage1', 'trigger', long);
    expect(s.mapLabels?.stage1?.trigger).toBeUndefined();
  });

  it('never labels a barred slot onto the map', () => {
    let s = setSlot(addFindings(createState(), 'stage2', 'wound', ['אני לא שווה']), 'stage2', 'wound', 2);
    s = setMapLabel(s, 'stage2', 'wound', 'לא שווה');
    expect(buildMap(s).stations).toEqual([]);
  });
});

describe('barred slots — refused at the store, not only at the drawing', () => {
  // prompt-editor, 4.9.2026: evaluator.md has no rule against naming a barred slot,
  // so the model WILL report a two-word naming of the מוגלה once stage 2 lands.
  // A single guard in a single consumer was all that stood between that and the
  // person's screen. The store refuses the write, so nothing downstream can slip.
  it('never stores a map label for the wound or the ADHD pattern', () => {
    let s = setMapLabel(createState(), 'stage2', 'wound', 'לא שווה');
    s = setMapLabel(s, 'stage2', 'adhd_pattern', 'קושי בוויסות');
    expect(s.mapLabels).toEqual({});
  });

  it('still stores a label for an ordinary stage-2 slot', () => {
    const s = setMapLabel(createState(), 'stage2', 'meaning', 'לא מקצועי');
    expect(s.mapLabels.stage2.meaning).toBe('לא מקצועי');
  });
});
