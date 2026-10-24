// The parents' interview — its rules, pinned by value.
//
// src/packs/think-twice-parents/pack.js is data, and an edit to data passes every
// behavioural test while changing what a parent meets: unbarring `parent_self`
// would put "which parent am I" on the screen, a different guard would hold a
// flooded parent longer, a moved component would close the interview elsewhere.
// tests/core/pack.test.js pins Think Twice's rules the same way. This is a QA
// draft (Natali has not approved it), so a change here is expected — it must just
// be made on purpose, with router-guard's review, and this file changed with it.

import { describe, it, expect } from 'vitest';
import { thinkTwiceParents as p } from '../../src/packs/think-twice-parents/pack.js';
import { validatePack, barredSlots, mentalSlots, intensityStages, stageWith } from '../../src/core/pack.js';

describe('the parents’ pack', () => {
  it('is valid, plain data, and says who it is', () => {
    expect(validatePack(p)).toEqual({ ok: true, errors: [], limits: [] });
    expect(JSON.parse(JSON.stringify(p))).toEqual(p);
    expect(p).toMatchObject({ id: 'think-twice-parents', name: 'Think Twice · הורים', version: 1 });
  });

  it('runs Natali’s seven steps as eight stages, in her order', () => {
    expect(p.stages.map((s) => s.label)).toEqual([
      'מה קרה',
      'מה ראינו',
      'מאיפה זה בא',
      'מה הוא היה צריך',
      'איפה זה פגש אותי',
      'מה אפשר לעשות',
      'מה אעשה ברגע הבא',
      'מה אתרגל',
    ]);
    expect(p.stages.map((s) => s.slots.map((x) => x.id))).toEqual([
      ['context', 'demand', 'child_behavior', 'parent_response', 'ending', 'setting_events'],
      ['behavior_label', 'coping_frame'],
      ['trait_link', 'parent_ownership'],
      ['child_need', 'child_feeling'],
      ['parent_emotion', 'parent_thought_then', 'prognosis', 'parent_self', 'coping_style', 'gap_insight'],
      ['alternatives', 'need_match'],
      ['goal', 'board_presented', 'sharp_decision', 'package_test'],
      ['recurring_situation', 'prevention_step', 'parent_practice', 'implementation', 'feasibility'],
    ]);
  });

  it('never draws or recites "which parent am I" — and nothing else', () => {
    expect([...barredSlots(p)]).toEqual(['parent_self']);
  });

  it('marks the minds', () => {
    expect([...mentalSlots(p)].sort()).toEqual(
      [
        'coping_frame', 'trait_link', 'parent_ownership', 'child_need', 'child_feeling',
        'parent_emotion', 'parent_thought_then', 'prognosis', 'parent_self', 'gap_insight', 'goal',
      ].sort()
    );
  });

  it('collects on stage 6, decides on stage 7, and closes on stage 8', () => {
    expect(stageWith(p, 'collector')).toBe(6);
    expect(stageWith(p, 'decision')).toBe(7);
    expect(stageWith(p, 'closing')).toBe(8);
    expect(stageWith(p, 'castClarity')).toBeNull();
    expect(intensityStages(p)).toEqual([5]);
  });

  it('paces each stage with its own load guard', () => {
    expect(p.routing).toEqual({ softThreshold: 0.8, saturationLimit: 2, loadGuard: 20 });
    expect(p.stages.map((s) => s.loadGuard ?? null)).toEqual([7, 4, 5, 5, 6, 8, null, 6]);
  });

  it('requires nothing — a dependency here would strand the parent (pack header)', () => {
    expect(p.stages.filter((s) => s.requires)).toEqual([]);
  });

  // Ran, 16.10.2026: the parents get a drawing too, made from the registrar's
  // record (docs/parent-app/registrar-model.html; tests/core/record-map.test.js).
  it('draws the event from the registrar’s record, and never "which parent am I"', () => {
    expect(p.map.source).toBe('record');
    expect(p.map.timeline).toBe('stage1.ending');
    expect(p.map.narrative.map((r) => [r.kind, r.slots])).toEqual([
      ['fact', ['stage1.demand', 'stage1.child_behavior']],
      ['action', ['stage1.parent_response']],
      ['fact', ['stage1.ending']],
      ['thought', ['stage5.parent_thought_then', 'stage5.gap_insight', 'stage7.goal']],
      ['feeling', ['stage4.child_feeling', 'stage5.parent_emotion']],
      ['other', ['stage4.child_need']],
      ['plan', ['stage7.sharp_decision', 'stage8.prevention_step', 'stage8.parent_practice']],
    ]);
    expect(JSON.stringify(p.map)).not.toContain('parent_self');
  });
});
