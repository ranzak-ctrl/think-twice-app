import { describe, it, expect } from 'vitest';
import { parseRegistrarResponse, applyRegistrar, runRegistrar } from '../../src/core/registrar.js';
import { createState } from '../../src/core/state.js';
import { buildSystemPrompt } from '../../src/core/promptBuilder.js';

const report = (o) => JSON.stringify(o);

describe('parseRegistrarResponse — its envelope has no message', () => {
  it('parses a bare object', () => {
    const r = parseRegistrarResponse(report({ beats: [{ id: 'b' }] }));
    expect(r.ok).toBe(true);
    expect(r.deltas.beats).toHaveLength(1);
  });

  it('strips code fences and leading prose', () => {
    expect(parseRegistrarResponse('```json\n{"beats":[]}\n```').ok).toBe(true);
    expect(parseRegistrarResponse('הנה:\n{"beats":[]}').ok).toBe(true);
  });

  it('reports no_json and invalid_json rather than throwing', () => {
    expect(parseRegistrarResponse('שום דבר')).toEqual({ ok: false, error: 'no_json' });
    expect(parseRegistrarResponse('{ברוקן')).toEqual({ ok: false, error: 'no_json' });
    expect(parseRegistrarResponse('{"a": }').error).toBe('invalid_json');
    expect(parseRegistrarResponse(undefined).ok).toBe(false);
  });

  it('defaults every list, so a partial report cannot crash the merge', () => {
    const { deltas } = parseRegistrarResponse('{}');
    for (const k of ['beats', 'stances', 'emotions', 'actors', 'edges', 'groups', 'openForks', 'gapObservations']) {
      expect(deltas[k]).toEqual([]);
    }
    expect(deltas.setting).toBeNull();
  });
});

describe('applyRegistrar folds a report into the document', () => {
  it('writes every entity store', () => {
    const s = applyRegistrar(createState(), parseRegistrarResponse(report({
      setting: { place: 'בסלון', conditions: ['גב תפוס'] },
      beats: [{ id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת', camera: true }],
      stances: [{ id: 's1', slot: 'stage2.causal', type: 'reading', actor: 'self', text: 'בלעדיי', source: 'stated' }],
      emotions: [{ id: 'e1', slot: 'stage3.emotion', actor: 'self', name: 'עלבון', intensity: 8 }],
      open_forks: [{ id: 'f1', question: 'מי מחליט', options: ['אתה', 'היא'] }],
    })).deltas);

    expect(s.eventRecord.setting.place).toBe('בסלון');
    expect(s.eventRecord.beats.b1.camera).toBe(true);
    expect(s.eventRecord.stances.s1.source).toBe('stated');
    expect(s.eventRecord.emotions.e1.intensity).toBe(8);
    expect(s.openForks.f1.question).toBe('מי מחליט');
  });

  it('records a contradiction against past versions into the hidden gap store', () => {
    const s = applyRegistrar(createState(), parseRegistrarResponse(report({
      gap_observations: [{ target: 'stage1.timeline', dimension: 'factual', level: 2, note: 'שתי גרסאות לתאריך' }],
    })).deltas, 4);
    expect(s.gaps.byTarget['stage1.timeline'].status).toBe('starred');
    expect(s.gaps.byTarget['stage1.timeline'].firstTurn).toBe(4);
  });

  it('leaves the state alone on an empty report', () => {
    const s = createState();
    expect(applyRegistrar(s, parseRegistrarResponse('{}').deltas)).toEqual(s);
    expect(applyRegistrar(s, null)).toBe(s);
  });
});

describe('the cast stops freezing at the end of stage 1', () => {
  const cast = (actors) => parseRegistrarResponse(report({ actors })).deltas;

  it('merges the cast at any stage — the seam that stranded stage 5', () => {
    const late = { ...createState(), meta: { ...createState().meta, currentStage: 5 } };
    const s = applyRegistrar(late, cast([{ id: 'wife', label: 'אשתך', clear: true }]));
    expect(s.actorMap.wife.label).toBe('אשתך');
  });

  it('the CODE derives the actors score from clarity, never the model', () => {
    let s = applyRegistrar(createState(), cast([{ id: 'wife', label: 'אשתך', clear: false }]));
    expect(s.coverage.stage1.actors).toBe(1); // unclear cast keeps stage 1 shut
    s = applyRegistrar(s, cast([{ id: 'wife', clear: true }]));
    expect(s.coverage.stage1.actors).toBe(2);
  });
});

describe('a registrar failure never costs the person their turn', () => {
  const base = { state: createState(), messages: [{ role: 'user', content: 'x' }], systemPrompt: 'p' };

  it('is inert with no prompt, no messages, or no implementation', async () => {
    for (const patch of [{ systemPrompt: '' }, { messages: [] }, { completeImpl: undefined }]) {
      const r = await runRegistrar({ ...base, completeImpl: async () => ({ ok: true, raw: '{}' }), ...patch });
      expect(r.error).toBe('not_configured');
      expect(r.state).toBe(base.state);
    }
  });

  it('returns the state untouched when the call throws, fails, or replies with junk', async () => {
    const cases = [
      async () => { throw new Error('network'); },
      async () => ({ ok: false, error: 'unauthorized' }),
      async () => ({ ok: true, raw: 'לא JSON' }),
    ];
    for (const completeImpl of cases) {
      const r = await runRegistrar({ ...base, completeImpl });
      expect(r.error).toBeTruthy();
      expect(r.state).toBe(base.state);
    }
  });

  it('still tallies usage from a call that parsed badly', async () => {
    const r = await runRegistrar({
      ...base,
      completeImpl: async () => ({ ok: true, raw: 'junk', usage: { input_tokens: 7 } }),
    });
    expect(r.usage).toEqual({ input_tokens: 7 });
  });
});

describe('the registrar reaches the interviewer', () => {
  // The whole pipeline in one assertion: a report folds into the record, the record
  // renders as an account, and the account leads the interviewer's prompt.
  it('what the registrar wrote this turn is in the next prompt the interviewer reads', async () => {
    const { state } = await runRegistrar({
      state: createState(),
      messages: [{ role: 'user', content: 'עברתי בסלון ושמעתי אותן' }],
      systemPrompt: 'p',
      completeImpl: async () => ({ ok: true, raw: report({
        setting: { place: 'בסלון', time: 'בערב' },
        beats: [{ id: 'b1', slot: 'stage1.trigger', actor: 'self', text: 'עברת בסלון ושמעת', camera: true, phase: 'during' }],
        actors: [{ id: 'wife', label: 'אשתך', relation: 'בת זוג', clear: true }],
      }) }),
    });

    const prompt = buildSystemPrompt({ stage: 1, state });
    expect(prompt).toContain('## המאורע כפי שנאסף עד כה');
    expect(prompt).toContain('בסלון · בערב');
    expect(prompt).toContain('עברת בסלון ושמעת');
    expect(prompt).toContain('— אשתך (בת זוג)');
  });
});
