// The event, rendered for the interviewer.
//
// Ran, 18.9.2026: "הרשם בונה את הגרף של המאורע ומספק את המידע הזה למראיין. המראיין
// מחליט מה השאלה הבאה. מה רמת הכיסוי — הכל כרגיל." And the purpose behind it, which
// he confirmed: THE INTERVIEW EXISTS TO BUILD THE EVENT, and not to leave it
// scattered across the accumulated insights of seven interviewers. `coverage` is
// instrumentation on the way there; the assembled event is the product.
//
// This module is where that product is handed over. Record in, an account out.
// It decides nothing — not a score, not a transition, not a question.
//
// ── WHY AN ACCOUNT AND NOT JSON ──
// What the probing agent reads today is `summarizeState`: actor_map, open_forks,
// nodes, edges and groups as raw JSON. The code's own comments say why they are
// there — so the model can see the ids it minted last turn and report correct
// deltas. So the interviewer reads a database dump in order to remember its own
// bookkeeping, and is meant to listen to a person in the same breath.
//
// Once the registrar owns the graph, the interviewer reports no deltas and needs no
// ids. The dump loses its only reason to exist and is replaced by this: the case as
// something a reader can hold. That is not cosmetic. A model given a list of
// key-value pairs answers about key-value pairs; a model given an account asks the
// next question about the story.
//
// ── THE COLUMN PER ACTOR IS THE POINT ──
// The cast is not a list of names with roles. Each character carries what they DID,
// what they WANTED or UNDERSTOOD, and what they FELT — their own column. Today
// nothing in the system can hold that: stage5.perspective and stage5.intention are
// slots of the INTERVIEWEE, so two other characters in one story collide in one
// slot, and the cast freezes at the end of stage 1 anyway (session.js).
//
// So an empty column is legible here, and that is deliberate: stage 5's whole job is
// filling one, and the interviewer choosing its next question is exactly who should
// see that it is empty. It is never shown to the person — see the note below.
//
// ── NEVER_SHOW_SLOTS DOES NOT APPLY HERE, AND THAT IS NOT AN OVERSIGHT ──
// This text goes into the INTERVIEWER'S PROMPT. It is never rendered to the person.
// The wound and the ADHD pattern must be in it: stage 2 explores them, and the
// interview cannot probe what it is not told. `findings` already ships wound
// material into the prompt today for the same reason, and `summarizeState` has
// always sent the full coverage map.
//
// The prohibition in CLAUDE.md is on FORMULATING the wound for him, reflecting it
// back as our reading, or confronting him with it. That is a rule about what the
// interviewer SAYS, enforced in the prompts and by the judge — not about what it
// knows. The guard that matters here is `displayable()` in eventRecord.js, and it
// belongs to whatever draws the map, not to this.
//
// If a future reader is tempted to filter the wound out of this view: doing so
// would make stage 2 unable to see its own subject, and would not protect anyone.

import { isSelf, bySlot } from './eventRecord.js';

// The interviewee is addressed, never described. Findings are already written in
// the second person (evaluator.md: "נסח כל ממצא בפנייה אליו — גוף שני"), and an
// account that switches to "the user" mid-way reads like a file being built on him.
const SELF = 'אתה';

const PHASES = [
  ['before', 'לפני'],
  ['during', 'במהלך'],
  ['after', 'אחרי'],
];

const has = (v) => typeof v === 'string' && v.trim().length > 0;

// A character's display name. Falls back to the id so a character the registrar
// referenced but never named is still visible rather than silently dropped — a
// missing name is exactly the kind of thing the interviewer should go clear up.
function nameOf(actorMap, id) {
  if (isSelf(id)) return SELF;
  const a = actorMap?.[id];
  return has(a?.label) ? a.label.trim() : String(id ?? '').trim();
}

// Everyone the event knows about: the cast, plus anyone a beat, stance or emotion
// is attributed to. The second half matters — the registrar can attribute a beat to
// someone before the cast entry for them exists, and dropping them here would hide
// the very character that needs clearing up.
function actorIds(state, record) {
  const ids = [];
  const seen = new Set();
  const add = (id) => {
    const v = String(id ?? '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    ids.push(v);
  };
  add('self'); // the interviewee leads the cast; he is the one in the room
  for (const id of Object.keys(state?.actorMap ?? {})) if (!isSelf(id)) add(id);
  for (const store of [record.beats, record.stances, record.emotions]) {
    for (const e of Object.values(store ?? {})) if (has(e.actor) && !isSelf(e.actor)) add(e.actor);
  }
  return ids;
}

// Noun labels, not verbs. A Hebrew verb inflects for gender and the record carries
// none, so `עשה` read wrong for half the cast ("אשתך: עשה"). Nouns also read better
// in a structured account than a sentence fragment does.
const STANCE_LABEL = { want: 'רצון', goal: 'מטרה', reading: 'פרשנות' };

// One actor's column: what they did, wanted or understood, and felt.
function actorBlock(record, actorMap, id) {
  const mine = (store) => Object.values(store ?? {}).filter((e) => (isSelf(id) ? isSelf(e.actor) : e.actor === id));
  const beats = mine(record.beats);
  const stances = mine(record.stances);
  const emotions = mine(record.emotions);

  const lines = [];
  if (beats.length) lines.push(`  פעולות: ${beats.map((b) => b.text).join(' · ')}`);

  for (const type of ['want', 'goal', 'reading']) {
    const of = stances.filter((s) => s.type === type);
    if (!of.length) continue;
    // The ownership test, visible. A reading the interviewer offered and he has not
    // adopted is marked, because the protocol says that stance is worth less until
    // he takes it into his own words — and the interviewer deciding its next
    // question is precisely who needs to know which ones those are.
    const txt = of
      .map((s) => (s.source === 'inferred' ? `${s.text} (הצעת המראיין — טרם אומצה)` : s.text))
      .join(' · ');
    lines.push(`  ${STANCE_LABEL[type]}: ${txt}`);
  }

  if (emotions.length) {
    const txt = emotions
      .map((e) => {
        const scale = e.intensity == null ? '' : ` (${e.intensity}/10)`;
        const pace = e.pace === 'prior' ? ' — הביא איתו' : e.pace === 'trait' ? ' — קו לדמותו' : '';
        return `${e.name}${scale}${pace}`;
      })
      .join(' · ');
    lines.push(`  רגש: ${txt}`);
  }

  // What is not known about this character. Stated as a fact about the record, for
  // the interviewer only — the person never sees this text. Only for OTHERS: an
  // empty column on the interviewee is the ordinary state of stages 1 and 2 and
  // says nothing, while an empty column on another character is what stage 5 exists
  // to fill.
  if (!isSelf(id)) {
    // Named with the same nouns as the headings above, so the line reads against
    // the block it sits under — and so no Hebrew verb has to agree with a gender
    // the record does not carry.
    const missing = [];
    if (!stances.some((s) => s.type === 'reading')) missing.push('פרשנות');
    if (!stances.some((s) => s.type === 'want' || s.type === 'goal')) missing.push('רצון/מטרה');
    if (!emotions.length) missing.push('רגש');
    if (missing.length && (beats.length || stances.length || emotions.length || actorMap?.[id])) {
      lines.push(`  לא ידוע: ${missing.join(' · ')}`);
    }
  }

  if (!lines.length) return '';
  const a = actorMap?.[id];
  const rel = !isSelf(id) && has(a?.relation) ? ` (${a.relation.trim()})` : '';
  const unclear = a?.clear === false ? ' ⚠ לא ברור' : '';
  return [`— ${nameOf(actorMap, id)}${rel}${unclear}`, ...lines].join('\n');
}

// The incident's sequence: episode beats, grouped by phase. Ongoing material has no
// place in a sequence (Ran, 5.9.2026 — the two clocks) and is rendered separately
// below, so the account never claims that a standing state was the next thing that
// happened.
function sequenceBlock(record, actorMap) {
  const episodes = Object.values(record.beats ?? {})
    .filter((b) => b.scale !== 'ongoing')
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  if (!episodes.length) return '';

  const out = [];
  for (const [phase, label] of PHASES) {
    const inPhase = episodes.filter((b) => b.phase === phase);
    if (!inPhase.length) continue;
    out.push(`  ${label}: ${inPhase.map((b) => beatLine(b, actorMap)).join(' → ')}`);
  }
  // Beats the registrar could not place. Named as unplaced rather than folded into
  // the sequence — inventing an order is the one thing the map was corrected for.
  const unplaced = episodes.filter((b) => !PHASES.some(([p]) => p === b.phase));
  if (unplaced.length) {
    out.push(`  לא מוקם בציר הזמן: ${unplaced.map((b) => beatLine(b, actorMap)).join(' · ')}`);
  }
  return out.length ? `**הרצף:**\n${out.join('\n')}` : '';
}

// A beat carries who did it. The attribution rule of evaluator.md:203 stands — an
// action belongs to the character who performed it — and here it finally shows,
// because a beat is an entity with an actor instead of a string inside an actor.
function beatLine(b, actorMap) {
  const who = has(b.actor) ? `${nameOf(actorMap, b.actor)}: ` : '';
  // The camera test, visible. Content that is a reading rather than something a
  // camera would have caught is marked so the interviewer can hear it as a reading
  // and go after the fact underneath it.
  const soft = b.camera ? '' : ' (פרשנות, לא עובדה מצולמת)';
  return `${who}${b.text}${soft}`;
}

// StateDocument → the event as an account for the interviewer's prompt.
// Empty sections are omitted rather than printed as empty headings: an account with
// blanks in it is a form, and a model handed a form fills the form.
export function renderEvent(state) {
  const record = state?.eventRecord;
  if (!record) return '';
  const actorMap = state?.actorMap ?? {};
  const s = record.setting ?? {};
  const parts = [];

  const stage = [];
  if (has(s.place)) stage.push(s.place);
  if (has(s.time)) stage.push(s.time);
  if (stage.length) parts.push(`**הזירה:** ${stage.join(' · ')}`);
  if (has(s.precedent)) parts.push(`**תקדים:** ${s.precedent}`);

  const cast = actorIds(state, record)
    .map((id) => actorBlock(record, actorMap, id))
    .filter(Boolean);
  if (cast.length) parts.push(`**השחקנים:**\n${cast.join('\n')}`);

  const seq = sequenceBlock(record, actorMap);
  if (seq) parts.push(seq);

  // The ground the incident ran on: standing conditions and ongoing beats, with no
  // arrows between them. "אין שותפות אמיתית" is not the next thing that happened
  // after "שאלת ממתי הוחלט" — it is what the minute happened inside of.
  const ongoing = Object.values(record.beats ?? {}).filter((b) => b.scale === 'ongoing');
  const ground = [...(s.conditions ?? []), ...ongoing.map((b) => beatLine(b, actorMap))];
  if (ground.length) parts.push(`**ברקע, לאורך זמן:** ${ground.join(' · ')}`);

  // What the story itself left undecided — a fact of the case, not a gap in our
  // knowledge (Natali, 29.8.2026). It belongs in the account for the same reason it
  // is drawn for the person: the unresolvedness is part of what happened.
  const forks = Object.values(state?.openForks ?? {}).filter((f) => f && !f.settled && has(f.question));
  if (forks.length) {
    parts.push(`**לא הוכרע בעולם:** ${forks.map((f) => `${f.question} (${f.options.join(' / ')})`).join(' · ')}`);
  }

  if (!parts.length) return '';
  return `## המאורע כפי שנאסף עד כה\n${parts.join('\n\n')}`;
}
