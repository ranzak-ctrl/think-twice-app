// The choice between the two interviews, shown on the QA build when an address names
// neither (Ran, 16.10.2026: one link must reach both). Each choice is a real link to
// the same page with the interview named, so it is a new page load — the same rule
// that governs the address everywhere else (interview.js).
//
// Interface copy, not prompt content: the model never reads it. Hebrew, and the
// names are the interviews' own (src/packs/*/pack.js).
import { choiceHref } from './interview.js';

const CHOICES = [
  {
    alias: 'adult',
    name: 'Think Twice · אישי',
    line: 'ראיון למבוגרים עם הפרעת קשב, מאירוע סוער ועד הכרעה.',
  },
  {
    alias: 'parents',
    name: 'Think Twice · הורים',
    line: 'ראיון להורים אחרי קונפליקט בבית. טיוטה לבדיקה.',
  },
];

export default function InterviewChoice({ search = '' }) {
  return (
    <main className="interview-choice" dir="rtl">
      <h1>איזה ראיון?</h1>
      <nav className="interview-choice-list" aria-label="הראיונות">
        {CHOICES.map((c) => (
          <a key={c.alias} className="choice-card" href={choiceHref(search, c.alias)}>
            <strong>{c.name}</strong>
            <span>{c.line}</span>
          </a>
        ))}
      </nav>
    </main>
  );
}
