// Stage rail — a read-only orientation strip beside the chat.
//
// Purpose: let the user see where they are relative to the whole process.
// It is deliberately INERT. design/brief.md §61 permits a stage indicator that
// *informs* and forbids one that navigates: no buttons, no links, no click
// handlers, no focus targets, nothing the Router doesn't own. Adding any
// interaction here hands stage control to the user, which is the one thing the
// product must never do — self-managing a multi-stage process is the very
// impairment the tool works around.
//
// brief.md §65 also rules out progress pressure, so there is no "3 מתוך 7",
// no percentage and no timer — position only, never pace.
//
// Labels are plain user-facing Hebrew, matching the register of
// content/signposting.js (Natali's wording). They must never carry stage
// numbers or clinical terms — "שלב 3" is jargon under the turn-lint rules.

const STAGES = [
  { n: 1, label: 'מה קרה' },
  { n: 2, label: 'איך הבנת את זה' },
  { n: 3, label: 'מה הרגשת' },
  { n: 4, label: 'איך הגבת' },
  { n: 5, label: 'זווית אחרת' },
  { n: 6, label: 'מה אפשר לעשות' },
  { n: 7, label: 'מה תבחר' },
];

export default function StageRail({ stage = 1, sessionComplete = false }) {
  return (
    <nav className="rail" aria-label="מיקום בתהליך">
      <ol className="rail-list">
        {STAGES.map(({ n, label }) => {
          // On a Re-open the Router moves currentStage backwards; stages ahead
          // of it correctly revert to 'upcoming' rather than staying ticked.
          const done = sessionComplete || n < stage;
          const current = !sessionComplete && n === stage;
          const cls = current ? 'is-current' : done ? 'is-done' : 'is-upcoming';
          return (
            <li
              key={n}
              className={`rail-step ${cls}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="rail-dot" aria-hidden="true" />
              <span className="rail-label">{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
