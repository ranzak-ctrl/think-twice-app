import { describe, it, expect } from 'vitest';
import { buildStory, LAYERS, NEVER_MIRROR } from '../../src/core/story.js';
import { buildMap } from '../../src/core/storyMap.js';
import {
  createState,
  addFindings,
  mergeActorMap,
  mergeOpenForks,
  mergeEdges,
  mergeGroups,
  setMapLabel,
  setSlot,
  exportState,
  importState,
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

describe('story edges — the relations belong to the interviewee', () => {
  // Ran, 5.9.2026: the edges are part of HIS story; where the system is not settled
  // on a relation it asks him. So the system never asserts one by default.
  it('leaves a new edge unconfirmed unless he said so', () => {
    const s = mergeEdges(createState(), [
      { from: 'stage1.trigger', to: 'stage3.emotion', kind: 'because' },
    ]);
    expect(s.edges['stage1.trigger→stage3.emotion'].confirmed).toBe(false);
  });

  it('keeps confirmation across a delta that omits the flag', () => {
    let s = mergeEdges(createState(), [
      { from: 'a', to: 'b', kind: 'then', confirmed: true },
    ]);
    s = mergeEdges(s, [{ from: 'a', to: 'b', kind: 'because' }]); // relation refined
    expect(s.edges['a→b']).toMatchObject({ kind: 'because', confirmed: true });
  });

  it('refuses an edge touching a barred slot, at the write', () => {
    // A wound with an arrow attached is still a wound on the drawing.
    const s = mergeEdges(createState(), [
      { from: 'stage2.wound', to: 'stage3.emotion', kind: 'because', confirmed: true },
      { from: 'stage3.emotion', to: 'stage2.adhd_pattern', kind: 'then', confirmed: true },
    ]);
    expect(s.edges).toEqual({});
  });

  it('refuses a self-loop and an unknown relation', () => {
    const s = mergeEdges(createState(), [
      { from: 'stage1.trigger', to: 'stage1.trigger', kind: 'then' },
      { from: 'a', to: 'b', kind: 'causes' },
    ]);
    expect(s.edges).toEqual({});
  });

  it('survives the export/import round trip and older exports without the field', () => {
    const s = mergeEdges(createState(), [{ from: 'a', to: 'b', kind: 'then' }]);
    expect(importState(exportState(s)).edges['a→b'].kind).toBe('then');
    const old = JSON.parse(exportState(s));
    delete old.edges;
    expect(importState(JSON.stringify(old)).edges).toEqual({});
  });
});

describe('story map — cross-stage material is drawn, not discarded', () => {
  // Ran, 5.9.2026: a conversation is not a linear axis. Material belonging to a
  // later stage that surfaces early is captured at level 1 and must be REPRESENTED,
  // not hidden until the interview reaches its stage.
  it('draws a later stage’s slot captured during stage 1, marked provisional', () => {
    let s = setSlot(addFindings(createState(), 'stage1', 'trigger', ['הודעה על גיוס']), 'stage1', 'trigger', 2);
    s = setSlot(addFindings(s, 'stage3', 'emotion', ['נעלבת']), 'stage3', 'emotion', 1);
    const st = buildMap(s).stations;
    expect(st.map((x) => x.label)).toEqual(['הודעה על גיוס', 'נעלבת']);
    expect(st.map((x) => x.provisional)).toEqual([false, true]);
  });

  it('promotes it to settled when the interview reaches the slot and confirms it', () => {
    let s = setSlot(addFindings(createState(), 'stage3', 'emotion', ['נעלבת']), 'stage3', 'emotion', 1);
    expect(buildMap(s).stations[0].provisional).toBe(true);
    s = setSlot(addFindings(s, 'stage3', 'emotion', ['עלבון עמוק']), 'stage3', 'emotion', 2);
    expect(buildMap(s).stations[0]).toMatchObject({ label: 'עלבון עמוק', provisional: false });
  });

  it('still refuses U — a thing he does not remember is not a thing you can draw', () => {
    const s = setSlot(addFindings(createState(), 'stage1', 'timeline', ['לא זוכר']), 'stage1', 'timeline', 'U');
    expect(buildMap(s).stations).toEqual([]);
  });

  it('still refuses a barred slot however it was captured', () => {
    const s = setSlot(addFindings(createState(), 'stage2', 'wound', ['אני לא שווה']), 'stage2', 'wound', 1);
    expect(buildMap(s).stations).toEqual([]);
  });
});

describe('story map — the graph orders the diagram, the stages only break ties', () => {
  // Ran, 5.9.2026: "with new information the GRAPH develops and the diagram
  // follows. The stages are the narrative by which the Router steers the interview
  // and makes sure no stage is left unanswered." So the stage order is a fallback
  // for material he has not related, never a claim about his story.
  const four = () => {
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage1', 'trigger', 'הודעה');
    put('stage3', 'emotion', 'עלבון');
    put('stage1', 'auto_reaction', 'יצאת');
    put('stage2', 'meaning', 'לא נחשב');
    return s;
  };

  it('falls back to the narrative order while he has related nothing', () => {
    expect(buildMap(four()).stations.map((n) => n.label)).toEqual([
      'הודעה', 'לא נחשב', 'עלבון', 'יצאת',
    ]);
  });

  it('re-orders to HIS order once he states a relation', () => {
    const s = mergeEdges(four(), [
      { from: 'stage1.auto_reaction', to: 'stage3.emotion', kind: 'because', confirmed: true },
    ]);
    expect(buildMap(s).stations.map((n) => n.label)).toEqual([
      'הודעה', 'לא נחשב', 'יצאת', 'עלבון',
    ]);
  });

  it('ignores an unconfirmed edge — the system never re-orders on its own guess', () => {
    const s = mergeEdges(four(), [
      { from: 'stage1.auto_reaction', to: 'stage3.emotion', kind: 'because' },
    ]);
    expect(buildMap(s).stations.map((n) => n.label)).toEqual([
      'הודעה', 'לא נחשב', 'עלבון', 'יצאת',
    ]);
  });

  it('survives a circular account instead of vanishing', () => {
    // People do describe circular causes. A drawing that disappeared over one
    // would be worse than a drawing that lays it out flat.
    const s = mergeEdges(four(), [
      { from: 'stage3.emotion', to: 'stage1.auto_reaction', kind: 'because', confirmed: true },
      { from: 'stage1.auto_reaction', to: 'stage3.emotion', kind: 'because', confirmed: true },
    ]);
    const out = buildMap(s).stations.map((n) => n.label);
    expect(out).toHaveLength(4);
    expect(new Set(out).size).toBe(4);
  });
});

describe('story map — a relation he stated across the story, not just next door', () => {
  it('draws a confirmed edge between non-adjacent beats as an arc', () => {
    // The chain can only link neighbours. Without arcs an edge he actually stated
    // was stored, sorted on, and then silently not drawn.
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage1', 'trigger', 'הבשר הגיע');
    put('stage1', 'timeline', 'אחרי ההערה');
    put('stage2', 'meaning', 'לא מקצועי');
    put('stage1', 'auto_reaction', 'עזבת');
    s = mergeEdges(s, [
      { from: 'stage1.timeline', to: 'stage1.auto_reaction', kind: 'because', confirmed: true },
    ]);
    const m = buildMap(s);
    const a = m.stations.findIndex((n) => n.id === 'stage1.timeline');
    const b = m.stations.findIndex((n) => n.id === 'stage1.auto_reaction');
    expect(Math.abs(a - b)).toBeGreaterThan(1); // genuinely not neighbours
    expect(m.arcs).toEqual([{ from: a, to: b, kind: 'because' }]);
  });

  it('does not arc an edge that is already a chain link', () => {
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage2', 'meaning', 'לא מקצועי');
    put('stage3', 'emotion', 'עלבון');
    s = mergeEdges(s, [
      { from: 'stage2.meaning', to: 'stage3.emotion', kind: 'because', confirmed: true },
    ]);
    const m = buildMap(s);
    expect(m.arcs).toEqual([]);
    expect(m.links[0].sourced).toBe(true);
  });

  it('never arcs an unconfirmed edge', () => {
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage1', 'trigger', 'הבשר');
    put('stage1', 'timeline', 'אחרי');
    put('stage1', 'auto_reaction', 'עזבת');
    s = mergeEdges(s, [{ from: 'stage1.trigger', to: 'stage1.auto_reaction', kind: 'because' }]);
    expect(buildMap(s).arcs).toEqual([]);
  });
});

describe('story map — containers', () => {
  // Ran, 5.9.2026: hierarchy between entities or processes as nested boxes. Two
  // kinds describe the WORLD; a container round the SELF is a different claim and
  // is not built — questions-for-natali §11.
  const base = () => {
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage1', 'trigger', 'הבשר הגיע');
    put('stage1', 'timeline', 'אחרי ההערה');
    s = mergeActorMap(s, [{ id: 'user', label: 'המשתמש' }, { id: 'mgr', label: 'הממונה' }]);
    return s;
  };

  it('resolves a process container to the stations it holds', () => {
    const s = mergeGroups(base(), [
      {
        id: 'shift',
        label: 'המשמרת',
        kind: 'process',
        members: ['stage1.trigger', 'stage1.timeline'],
        confirmed: true,
      },
    ]);
    const c = buildMap(s).containers[0];
    expect(c).toMatchObject({ label: 'המשמרת', kind: 'process' });
    expect(c.stations).toHaveLength(2);
  });

  it('resolves a community container to the characters it holds', () => {
    const s = mergeGroups(base(), [
      {
        id: 'work',
        label: 'המטבח',
        kind: 'community',
        members: ['actor:user', 'actor:mgr'],
        confirmed: true,
      },
    ]);
    expect(buildMap(s).containers[0].actors).toEqual(['user', 'mgr']);
  });

  it('refuses a container round the self — that ruling is not made', () => {
    const s = mergeGroups(base(), [
      { id: 'me', label: 'העצמי', kind: 'self', members: ['stage1.trigger', 'stage1.timeline'], confirmed: true },
    ]);
    expect(s.groups).toEqual({});
    expect(buildMap(s).containers).toEqual([]);
  });

  it('refuses a container of one, and one holding a barred slot', () => {
    let s = mergeGroups(base(), [
      { id: 'solo', label: 'יחיד', kind: 'process', members: ['stage1.trigger'] },
    ]);
    expect(s.groups).toEqual({});
    s = mergeGroups(base(), [
      { id: 'w', label: 'x', kind: 'process', members: ['stage2.wound', 'stage1.trigger'] },
    ]);
    expect(s.groups).toEqual({}); // only one member survived the filter
  });

  it('drops a container whose members are not on the map', () => {
    const s = mergeGroups(base(), [
      {
        id: 'ghost',
        label: 'רחוק',
        kind: 'process',
        members: ['stage7.goal', 'stage6.alternatives'],
        confirmed: true,
      },
    ]);
    expect(buildMap(s).containers).toEqual([]);
  });
});

describe('story map — perspectives', () => {
  // Ran, 5.9.2026: "my point of view sits in my container, the other's in his",
  // and "I would be very careful about what I include inside it — checking with
  // the interviewee." Two boxes, and nothing drawn until he confirms it.
  const base = () => {
    let s = createState();
    const put = (k, sl, t) => { s = setSlot(addFindings(s, k, sl, [t]), k, sl, 2); };
    put('stage1', 'trigger', 'הבשר הגיע');
    put('stage1', 'timeline', 'אחרי ההערה');
    put('stage5', 'perspective', 'לחץ של ערב');
    put('stage5', 'intention', 'שהמנה תצא');
    return s;
  };
  const view = (id, owner, members, confirmed = true) => ({
    id, label: id, kind: 'perspective', owner, members, confirmed,
  });

  it('holds his view and the other’s as two separate containers', () => {
    const s = mergeGroups(base(), [
      view('mine', 'self', ['stage1.trigger', 'stage1.timeline']),
      view('his', 'actor:manager', ['stage5.perspective', 'stage5.intention']),
    ]);
    const cs = buildMap(s).containers;
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.owner)).toEqual(['self', 'actor:manager']);
  });

  it('draws nothing until he has confirmed it', () => {
    const s = mergeGroups(base(), [
      view('mine', 'self', ['stage1.trigger', 'stage1.timeline'], false),
    ]);
    expect(s.groups.mine.confirmed).toBe(false); // on record, awaiting clarification
    expect(buildMap(s).containers).toEqual([]);  // and not on the paper
  });

  it('never confirms a container by default', () => {
    const s = mergeGroups(base(), [
      { id: 'x', label: 'x', kind: 'community', members: ['actor:a', 'stage1.trigger'] },
    ]);
    expect(s.groups.x.confirmed).toBe(false);
  });

  it('refuses a perspective with nobody to own it', () => {
    const s = mergeGroups(base(), [
      { id: 'nobody', label: 'x', kind: 'perspective', members: ['stage1.trigger', 'stage1.timeline'], confirmed: true },
    ]);
    expect(s.groups).toEqual({});
  });

  it('lets both views hold the same beat — they did both see it', () => {
    const s = mergeGroups(base(), [
      view('mine', 'self', ['stage1.trigger', 'stage1.timeline']),
      view('his', 'actor:manager', ['stage1.trigger', 'stage5.intention']),
    ]);
    const cs = buildMap(s).containers;
    expect(cs[0].stations).toContain(0);
    expect(cs[1].stations).toContain(0); // shared ground, not a collision
  });
});
