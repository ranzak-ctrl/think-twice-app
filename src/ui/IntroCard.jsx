// Intro card — "איך זה עובד", shown above the first message.
//
// Expectation-setting that would not fit in the opening turn: the conversational
// lint allows ~3 sentences and one question per system turn, and a five-step
// roadmap is neither. So the roadmap lives here, as interface rather than as
// something the interviewer says. Ported from the Claude Design artifact
// (project 21ed9722) and deliberately sharing the spine-and-dot language of
// StageRail, so the preview and the in-session orientation read as one system.
//
// design/brief.md governs the treatment: "the screen must be quiet", nothing may
// read as a scorecard, and the sharpest constraint — anything that smells of
// criticism triggers defensiveness. Hence no icons, no emoji, no gradient, no
// encouragement copy. It states what will happen and stops.
//
// The steps are the journey in plain words, never stage numbers ("שלב 3" is
// jargon toward the user) and never a control — the Router owns every
// transition.

const STEPS = [
  { lead: 'מה בדיוק קרה', rest: '— מי היה שם, מה נאמר, מה עשית' },
  { lead: 'איך הבנת את זה,', rest: 'ולמה זה תפס אותך ככה' },
  { lead: 'מה הרגשת,', rest: 'ואיך הגבת ברגע עצמו' },
  { lead: 'איך זה נראה', rest: 'מזווית אחרת' },
  { lead: 'ומה אתה בוחר', rest: 'לעשות עכשיו' },
];

export default function IntroCard() {
  return (
    <section className="intro" aria-label="איך זה עובד">
      <h2 className="intro-title">איך זה עובד</h2>
      <p className="intro-lead">נעבור יחד על אירוע אחד שהסעיר אותך, בקצב שלך.</p>

      <div className="intro-steps">
        {STEPS.map(({ lead, rest }, i) => (
          <div className={`intro-step${i === 0 ? ' is-first' : ''}`} key={lead}>
            <span className="intro-dot" aria-hidden="true" />
            <span className="intro-text">
              {lead} <span className="intro-quiet">{rest}</span>
            </span>
          </div>
        ))}
      </div>

      <p className="intro-foot">
        אפשר לעצור בכל רגע. מה שנכתב כאן נשאר בדפדפן שלך ולא נשמר בשום מקום.
      </p>
    </section>
  );
}
