import { describe, it, expect } from 'vitest';
import { buildStory, LAYERS, NEVER_MIRROR } from '../../src/core/story.js';
import { createState, addFindings, mergeActorMap, setSlot } from '../../src/core/state.js';

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
