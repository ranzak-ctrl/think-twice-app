// Safety layer — pre-check every user message before it reaches the model.
// NEVER remove or weaken this module.

const CRISIS_PATTERNS = [
  /פגיעה עצמית/i,
  /להרוג את עצמ/i,
  /אובדנ/i,
  /סכנת חיים/i,
  /רוצה למות/i,
  /לא רוצה לחיות/i,
  /להתאבד/i,
  /self.harm/i,
  /suicid/i,
  /kill myself/i,
];

const SAFE_STOP_MESSAGE = `אני שומע שאתה עובר משהו כבד מאוד עכשיו. זה מה שחשוב כרגע, לא הראיון.

אם אתה בסכנה — פנה מיד לער"ן: 1201, או לחדר המיון הקרוב.

אני כאן אם תרצה לדבר, אבל הראיון יכול לחכות.`;

export function preCheck(userMessage) {
  const triggered = CRISIS_PATTERNS.some((pattern) => pattern.test(userMessage));
  return {
    safe: !triggered,
    stopMessage: triggered ? SAFE_STOP_MESSAGE : null,
  };
}
