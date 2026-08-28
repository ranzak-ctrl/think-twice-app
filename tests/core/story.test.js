import { describe, it, expect } from 'vitest';
import { buildStory, SCENES, NEVER_MIRROR } from '../../src/core/story.js';
import { createState, addFindings, mergeActorMap } from '../../src/core/state.js';
import { readFile } from 'node:fs/promises';

// The story mirror (src/core/story.js). These tests guard the four hard rules in
// that file's header — each one is a written clinical constraint, not a
// preference, so a change that trips one of these should fail the build rather
// than reach a tester.

describe('story projection — the clinical exclusions', () => {
  it('never mirrors the wound, even when findings carry it', () => {
    // CLAUDE.md: the person reaches the wound himself. Reflecting it back as our
    // interpretation is forbidden — Natali, 14.8.2026.
    let s = addFindings(createState(), 'stage2', 'wound', ['אני לא שווה כלום']);
    s = addFindings(s, 'stage2', 'causal', ['חשבתי שהיא מזלזלת בי']);
    const story = buildStory(s);
    const all = story.scenes.flatMap((sc) => sc.lines).join(' ');
    expect(all).not.toContain('אני לא שווה כלום');
    expect(all).toContain('חשבתי שהיא מזלזלת בי');
  });

  it('never mirrors the ADHD pattern', () => {
    // CLAUDE.md: adhd_pattern is a normalising hypothesis the interviewer SAYS,
    // never a label displayed back at the person.
    const s = addFindings(createState(), 'stage2', 'adhd_pattern', ['דפוס של קשב']);
    expect(buildStory(s).scenes).toHaveLength(0);
  });

  it('excludes the barred slots by construction, not by scene list', () => {
    // Rule 2 is enforced inside linesFor, so a future scene cannot re-admit them.
    for (const scene of SCENES) {
      for (const [, slot] of scene.slots) expect(NEVER_MIRROR.has(slot)).toBe(false);
    }
    expect(NEVER_MIRROR.has('wound')).toBe(true);
    expect(NEVER_MIRROR.has('adhd_pattern')).toBe(true);
  });

  it('shows the cast but never a character clarity flag', () => {
    // `clear:false` is the stage-1 gate and an assessment of what the person
    // said. It drives the Router; it must not reach the mirror (rule 3).
    const s = mergeActorMap(createState(), [
      { id: 'dad', label: 'אבא', role: 'התקשר', clear: false, actions: ['התקשר בערב'] },
    ]);
    const { cast } = buildStory(s);
    expect(cast).toHaveLength(1);
    expect(cast[0]).toMatchObject({ label: 'אבא', role: 'התקשר', actions: ['התקשר בערב'] });
    expect(cast[0]).not.toHaveProperty('clear');
    expect(JSON.stringify(cast)).not.toContain('false');
  });

  it('reads nothing from coverage, gaps or the saturation counters', () => {
    // Rule 1: content, never assessment. A state carrying only scores and gap
    // records — no findings, no cast — must project to an empty story.
    let s = createState();
    s.coverage.stage1 = { trigger: 2, timeline: 2, actors: 2, status: 2, auto_reaction: 2 };
    s.gaps = { byTarget: { 'stage1.timeline': { level: 1, status: 'starred' } }, log: [] };
    s.meta.saturationCount = 2;
    const story = buildStory(s);
    expect(story.isEmpty).toBe(true);
    expect(story.scenes).toEqual([]);
  });
});

describe('story projection — the story that grows', () => {
  it('is empty on a fresh state, so nothing renders before the first answer', () => {
    expect(buildStory(createState()).isEmpty).toBe(true);
  });

  it('drops empty scenes rather than showing them as blanks', () => {
    // A column of labelled empty boxes is a completion meter (brief.md:63-65).
    const s = addFindings(createState(), 'stage1', 'trigger', ['קניתי בשר לא איכותי']);
    const story = buildStory(s);
    expect(story.scenes.map((sc) => sc.key)).toEqual(['event']);
  });

  it('orders scenes as the story happened, not as the stages ran', () => {
    // event → thought → feeling → action is the chain the arrows have to mean.
    // The interpretation is collected in stage 2, AFTER the reaction was recorded
    // as a stage-1 fact, and still lands between them.
    let s = addFindings(createState(), 'stage1', 'trigger', ['הודעה מהמורה']);
    s = addFindings(s, 'stage1', 'auto_reaction', ['צעקתי עליה']);
    s = addFindings(s, 'stage3', 'emotion', ['בושה']);
    s = addFindings(s, 'stage2', 'meaning', ['שאני אבא גרוע']);
    expect(buildStory(s).scenes.map((sc) => sc.key)).toEqual([
      'event',
      'thought',
      'feeling',
      'action',
    ]);
  });

  it('merges the reaction reported in stage 1 and stage 4 without repeating it', () => {
    let s = addFindings(createState(), 'stage1', 'auto_reaction', ['צעקתי עליה']);
    s = addFindings(s, 'stage4', 'auto_reaction', ['צעקתי עליה', 'יצאתי מהחדר']);
    const action = buildStory(s).scenes.find((sc) => sc.key === 'action');
    expect(action.lines).toEqual(['צעקתי עליה', 'יצאתי מהחדר']);
  });

  it('survives a partial or malformed state without throwing', () => {
    expect(buildStory(undefined).isEmpty).toBe(true);
    expect(buildStory({}).isEmpty).toBe(true);
    expect(buildStory({ findings: { stage1: { trigger: [null, '  ', 'טוב'] } } }).scenes[0].lines)
      .toEqual(['טוב']);
    expect(buildStory({ actorMap: { a: { label: '' }, b: { label: 'רומי' } } }).cast)
      .toHaveLength(1);
  });
});

describe('story projection — the cast as people', () => {
  it("addresses the person instead of calling them 'המשתמש'", () => {
    // The mirror is shown TO this person. A card labelled "the user" is the
    // system discussing them in the third person (design/brief.md:66).
    const s = mergeActorMap(createState(), [{ id: 'user', label: 'המשתמש', role: 'הטבח' }]);
    expect(buildStory(s).cast[0].label).toBe('אתה');
  });

  it('leaves a real character whose name resembles a self-label alone', () => {
    const s = mergeActorMap(createState(), [{ id: 'x', label: 'המשתמש בחנות' }]);
    expect(buildStory(s).cast[0].label).toBe('המשתמש בחנות');
  });

  it('does not print the role again as one of that character\'s actions', () => {
    const s = mergeActorMap(createState(), [
      {
        id: 'boss',
        label: 'הממונה',
        role: 'אמר שהבשר לא איכותי',
        actions: ['אמר שהבשר לא איכותי', 'הלך למטבח'],
      },
    ]);
    expect(buildStory(s).cast[0].actions).toEqual(['הלך למטבח']);
  });
});

describe('story projection — scene titles', () => {
  it('never reuses a stage-rail label', async () => {
    // Both are on screen at once. The rail names the process in questions; the
    // mirror names parts of the story in nouns. The same words in both places
    // put one label on screen twice meaning two different things.
    const railSource = await readFile(
      new URL('../../src/ui/StageRail.jsx', import.meta.url),
      'utf8',
    );
    const railLabels = [...railSource.matchAll(/label:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(railLabels.length).toBe(7); // guard: the regex still finds them
    for (const scene of SCENES) expect(railLabels).not.toContain(scene.title);
  });
});
