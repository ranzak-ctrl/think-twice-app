// A four-stage interview that is not Think Twice — for the tests that prove the
// engine and the shell run whatever pack they are handed (phase 1, slice 3,
// 10.10.2026). Every shape Think Twice fixes is somewhere else here: four stages,
// the cast gated on stage 2 as `people`, intensity measured in stages 2 and 3, the
// decision on stage 4, and a barred slot named neither `wound` nor `adhd_pattern`.
// Its texts are placeholders: what the model reads is not what these tests ask.

export const four = {
  id: 'four-stage-test',
  name: 'ראיון בדיקה',
  version: 1,
  routing: { softThreshold: 0.8, saturationLimit: 2, loadGuard: 12 },
  stages: [
    { key: 'stage1', name: 'זירה', label: 'מה קרה', slots: [{ id: 'event' }, { id: 'when' }] },
    {
      key: 'stage2',
      name: 'משמעות',
      label: 'מה זה אמר',
      slots: [
        { id: 'people' },
        { id: 'reading', mental: true },
        { id: 'hidden_hurt', mental: true, barred: true },
      ],
      components: [{ type: 'castClarity', slot: 'people' }, { type: 'intensity' }],
    },
    {
      key: 'stage3',
      name: 'אפשרויות',
      label: 'מה אפשר',
      slots: [{ id: 'options' }],
      components: [{ type: 'collector' }, { type: 'intensity' }],
    },
    {
      key: 'stage4',
      name: 'בחירה',
      label: 'מה בוחרים',
      requires: ['stage3'],
      slots: [{ id: 'goal', mental: true }, { id: 'board_presented' }, { id: 'sharp_decision' }, { id: 'package_test' }],
      components: [{ type: 'decision' }],
    },
  ],
  map: {
    narrative: [
      { kind: 'fact', slots: ['stage1.event', 'stage1.when'] },
      { kind: 'thought', slots: ['stage2.reading'] },
    ],
    timeline: 'stage1.when',
  },
};

const t = (k) => `[${k}]`;
export const prompts = {
  guidelines: { super: '<!-- @identity required -->\n<!-- @rules -->\n[super]\n', specific: '<!-- @identity -->\n[identity]\n' },
  resistance: t('resistance'),
  evaluator: t('evaluator'),
  registrar: t('registrar'),
  summary: t('summary'),
  summaryNudge: 'סכם בקצרה, במילים שלי, את מה שמסרתי בשלב הזה. בלי שאלה.',
  opener: t('opener'),
  board: t('board'),
  forbidden: ['[forbidden]'],
  stages: Object.fromEntries(four.stages.map((s) => [s.key, t(s.key)])),
};
