// KPI helpers — portable, no UI. Currently: the self/other reference ratio
// (יחס אני/הוא), a directional measure of how much the user speaks about
// themselves vs. the other party. The healthy arc of an interview shifts toward
// self-ownership and, at stage 5, toward the other's perspective.
//
// This is a transcript-derived heuristic over Hebrew pronouns/possessives — meant
// to be directional for the clinician panel, not a precise linguistic count.

// First-person markers (self).
const SELF = new Set([
  'אני', 'אנחנו', 'אנו', 'לי', 'אותי', 'אותנו', 'שלי', 'שלנו',
  'איתי', 'איתנו', 'אצלי', 'אצלנו', 'ממני', 'בי', 'עליי', 'עלי',
]);

// Third-person markers (other).
const OTHER = new Set([
  'הוא', 'היא', 'הם', 'הן', 'אותו', 'אותה', 'אותם', 'אותן',
  'שלו', 'שלה', 'שלהם', 'שלהן', 'לו', 'לה', 'להם', 'להן',
  'איתו', 'איתה', 'איתם', 'איתן', 'עליו', 'עליה', 'עליהם', 'עליהן',
  'אצלו', 'אצלה', 'ממנו', 'ממנה', 'מהם',
]);

// Classify one Hebrew token. Exact match first; then peel up to two proclitic
// prefix letters (ו/ש/ה/ל/ב/מ/כ) but only accept a stripped candidate of length
// ≥3, so common words like "כלה" → "לה" don't get miscounted as pronouns.
function classifyToken(tok) {
  if (SELF.has(tok)) return 'self';
  if (OTHER.has(tok)) return 'other';
  for (let i = 1; i <= 2; i++) {
    const cand = tok.slice(i);
    if (cand.length < 3) break;
    if (SELF.has(cand)) return 'self';
    if (OTHER.has(cand)) return 'other';
  }
  return null;
}

// Count self vs. other references in a chunk of Hebrew text.
export function countSelfOther(text) {
  const tokens = String(text ?? '').split(/[^֐-׿]+/).filter(Boolean);
  let self = 0;
  let other = 0;
  for (const tok of tokens) {
    const kind = classifyToken(tok);
    if (kind === 'self') self++;
    else if (kind === 'other') other++;
  }
  return { self, other };
}

// Format the running ratio for display: "self:other (NN% אני)" or "—" when empty.
export function formatSelfOther(self, other) {
  const total = self + other;
  if (!total) return '—';
  const pct = Math.round((self / total) * 100);
  return `${self}:${other} (${pct}% אני)`;
}
