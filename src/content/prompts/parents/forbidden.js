// The parents' interview — its blacklist, injected into every prompt it builds.
//
// v1 · 16.10.2026 · DRAFT FOR QA, AWAITING NATALI'S APPROVAL — not for a real
// parent before she signs off. Written by prompt-editor at Ran's request (bring the
// parents' interview up on the QA link).
//
// The shared FORBIDDEN_PATTERNS less one line, plus the parents' additions from
// docs/parent-app/interview-model.md §5.5.
//
// The line taken out is the adult model's jargon ban. Ran ruled on 9.10.2026 that
// with parents professional terms are allowed and even important — the ban is a
// rule of the adult model, not of the platform (CLAUDE.md, "Lint שיחתי") — and that
// ruling is later than §5.5, so §5.5's own jargon line is not added either. What
// the adult line also covered, the system's own words ("שלב 3", "סלוט"), stays
// banned in the parents' first line below.
//
// Matched by exact text. If the shared line is ever reworded the filter stops
// matching, and tests/core/prompt-fingerprint-parents.test.js fails rather than
// letting the ban slip back into the parents' prompts in silence.

import { FORBIDDEN_PATTERNS } from '../../forbidden.js';

export const ADULT_JARGON_BAN = 'אסור: ז\'רגון טיפולי כלפי המשתמש ("פרשנות חלופית", "תגובה אדפטיבית", "שלב 3").';

export const PARENTS_ADDITIONS = [
  'אסור: לדבר אל ההורה בשפת המערכת ("סלוט", "שלב 3", שמות של שלבים או של תיוגים פנימיים).',
  'אסור: שפת תיקון כלפי ההורה ("את/ה צריך/ה", "הורה טוב היה...", "היית צריך...").',
  'אסור: מילות אופי על הילד מפי המראיין ("חצוף", "מפונק", "עצלן", "אלים").',
  'אסור: נאום — יותר משני משפטי הסבר לפני שאלה.',
  'אסור: לנסח במקום ההורה את הצורך של הילד, או את "איזה הורה אני".',
  'אסור: לומר להורה איזה דפוס הורי זיהית ("את מגוננת", "אתה מעניש").',
  'אסור: לאבחן — לא את הילד ולא את ההורה.',
];

export const PARENTS_FORBIDDEN = [
  ...FORBIDDEN_PATTERNS.filter((line) => line !== ADULT_JARGON_BAN),
  ...PARENTS_ADDITIONS,
];
