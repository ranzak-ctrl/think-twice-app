// The preamble — operating instructions, not a turn.
//
// This began as a five-step "איך זה עובד" card, then shrank to a one-line
// reassurance under the composer. The redesign gives it the job the opening
// turn had been doing badly: the three framing sentences that used to ride in
// front of the first question were never a reply — they answered nothing and
// were not said at a moment worth stamping — so they leave the transcript and
// become interface.
//
// Wording is Ran's, unchanged. Only its frame moved: it is now pinned under
// the header, outside the scroller, so it cannot scroll up the column with the
// first answers and read as something that was said. A card, a mark or a stamp
// would all mean "someone said this" — none of which applies here.
//
// Chat.jsx renders it only until the first answer (Ran, 23.8). It is what the
// person needs before they know what this is; once they are answering, they
// have read it, and at 17px over four lines it would hold a third of the
// window for the rest of the session.
//
// Bound by the interface rules, not the conversational lint: it is allowed the
// roadmap the turn-lint keeps out of a turn.

export default function Preamble() {
  return (
    <p className="preamble">
      אם קרה משהו שהסעיר אותך והוא עדיין רץ לך בראש — כאן המקום לעבור עליו לאט.
      נתחיל ממה שקרה בפועל, נמשיך להבין למה זה תפס אותך ככה, ונתקדם יחד אל
      הנקודה שתוכל/י לבחור את התגובה הכי נכונה עבורך. אני מוביל, שואל שאלה אחת
      בכל פעם, ובסוף הראיון תוכל/י לקבל החלטה מושכלת.
    </p>
  );
}
