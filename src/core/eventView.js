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
// ── REDACTION: THE DEFAULT IS SAFE, AND buildSystemPrompt OPTS OUT ──
// An earlier version of this header claimed NEVER_SHOW_SLOTS need not apply here
// because "this text goes into the INTERVIEWER'S PROMPT, never to the person", and
// because "findings already ships wound material into the prompt today". BOTH WERE
// FALSE, and router-guard caught it before the registrar went live:
//
//   1. renderEvent is called from `summarizeState`, which is a body of FOUR
//      builders — buildSystemPrompt, buildSummaryPrompt, buildOpenerPrompt and
//      buildBoardPrompt. The summary and the opener are the two calls whose entire
//      output is spoken to the person, and the summary instruction is literally
//      "סכם בקצרה, במילים שלי".
//   2. `findings` appears in NO prompt — it goes only to GuidePanel. The single
//      wound-related item any prompt carried was the integer coverage.stage2.wound,
//      which has no text in it. This account was about to be the first mechanism in
//      the project's history to put מוגלה TEXT into a prompt, and it would have
//      landed in the two user-facing ones.
//
// Nothing downstream would have stopped it: forbidden.js has no wound rule, and
// neither summary.md nor opener.md nor persona.md mentions the מוגלה. The stage-2
// agent prompt, the one place the rule lives, is not part of the summary call.
//
// So `full` defaults to FALSE and redacts, and only buildSystemPrompt — the probe,
// which must know the wound in order to explore it — asks for the whole account.
// The polarity is deliberate: a future builder that forgets to think about this
// gets the safe behaviour, not the leak. The guard is `displayable()` from
// eventRecord.js, exported for exactly this and previously not called by the
// projection that needed it most.

import { isSelf, displayable } from './eventRecord.js';

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
  // The interviewee leads the cast, under whatever id the cast actually uses for
  // him. evaluator.md and the mock spell it `user`, which isSelf accepts — keying
  // the block on the literal 'self' meant actorMap['self'] was undefined, so an
  // interviewee marked clear:false lost his ⚠ and his relation.
  add(Object.keys(state?.actorMap ?? {}).find(isSelf) ?? 'self');
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

  // A "לא ידוע" line naming what is missing from another character's mind-layer
  // used to sit here. Removed, on router-guard's finding: it fired for any actor in
  // `actorMap` whether or not the ledger held anything, so from stage-1 turn three
  // onward EVERY prompt gained a section whose whole content was a list of what is
  // unknown about another character's interpretation, wants and feelings — stage-5
  // and stage-3 material, pushed at the stage-1 agent. docs/test-plan.md §א.2 item
  // 10 is a live regression for exactly that drift (סחף שלב 2→5).
  //
  // The account's job is to say what IS known. What to probe next is the stage
  // prompt's and the Router's, and duplicating it here only creates pressure across
  // a boundary the interview works to hold. Reversible, stage-gated, if it turns
  // out the interviewer wants it — that is a clinical call, not a code one.

  // A character in the cast is part of the event even before anything is recorded
  // about them — "who is in this story" is an answer, and dropping them here made
  // the account quietly narrower than the cast. So the name line stands on its own;
  // what is MISSING about them is deliberately not named (see above).
  const a = actorMap?.[id];
  if (!lines.length && !a) return '';
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

// ── THE RELATIONS HE STATED ──
// Until 18.9.2026 the account rendered no edges at all, and adding `derives_from`
// made that visible: an edge kind the interviewer never sees is a field nothing
// consumes — the exact mistake `facts`/`thoughts`/`feelings`/`reactions` were.
//
// Not every edge needs a line here. The account ALREADY expresses two of the four
// kinds implicitly: the sequence is `then`, and the per-actor columns are `agent`.
// What it silently dropped is the three that carry a claim — `because`, `echo` and
// `derives_from` — which are precisely the ones the person had to state himself.
//
// Only `confirmed` edges. An unconfirmed edge is a relation the system is not
// settled on, and it belongs in the clarification queue, not in an account that
// reads as what is known (Ran, 5.9.2026).
const RELATION_LABEL = {
  because: 'ולכן',
  echo: 'מזכיר',
  derives_from: 'נגזר מ',
  about: 'על',
  despite: 'למרות',
  alternative_to: 'במקום',
};

// An endpoint's readable name. Endpoints are addressed four ways — a slot's own
// cube, an actor, a fork, or a ledger entity — and an edge whose endpoint cannot be
// resolved is dropped rather than printed as a raw id.
function endpointText(state, record, actorMap, ref) {
  const id = String(ref ?? '').trim();
  const actor = /^actor:(.+)$/.exec(id);
  if (actor) return nameOf(actorMap, actor[1]);
  const fork = /^fork:(.+)$/.exec(id);
  if (fork) return state?.openForks?.[fork[1]]?.question ?? '';
  const entity = /^(beat|stance|emotion):(.+)$/.exec(id);
  if (entity) {
    const store = { beat: record.beats, stance: record.stances, emotion: record.emotions }[entity[1]];
    const e = store?.[entity[2]];
    // Redaction reaches here too. mergeEdges refuses an edge whose endpoint is a
    // BARRED SLOT, but an entity-id endpoint ("stance:w") does not match that
    // pattern — so a wound stance can legitimately be an endpoint, and this is
    // where the redacted account has to stop it.
    return e ? (e.label?.trim() || e.text || e.name || '') : '';
  }
  const slot = /^stage[1-7]\.(.+)$/.exec(id);
  if (slot) {
    const beats = Object.values(record.beats ?? {}).filter((b) => b.slot === id);
    if (beats.length) return beats[0].label?.trim() || beats[0].text;
    return state?.mapLabels?.[id.split('.')[0]]?.[slot[1]] ?? '';
  }
  return '';
}

function relationsBlock(state, record, actorMap) {
  const lines = [];
  for (const e of Object.values(state?.edges ?? {})) {
    if (!e?.confirmed) continue;
    const label = RELATION_LABEL[e.kind];
    if (!label) continue; // `then` and `agent` are already in the account
    const from = endpointText(state, record, actorMap, e.from);
    const to = endpointText(state, record, actorMap, e.to);
    if (!from || !to) continue; // unresolvable, or redacted away
    lines.push(`  ${from} ← ${label} ← ${to}`);
  }
  return lines.length ? `**קשרים שציינת:**\n${lines.join('\n')}` : '';
}

// ── THE CONTRADICTIONS, FOR THE PROBE ONLY ──
// Ran, 18.9.2026: "המראיין שמקבל את הסיפור בתחילת כל turn חייב להיות מודע לסתירות
// ולרמת חומרתן, כיוון שיש לזה השפעה מאוד גדולה על בחירת השאלה הבאה."
//
// This rides the `full` flag, and that is not a convenience — it is the whole
// safety of it. The account feeds FOUR builders and two of them (summary, opener)
// are spoken to the person verbatim. `full` is already "the probe's unredacted
// view"; contradictions belong to exactly that set and to nothing else. A test
// asserts they never appear in the redacted account.
//
// THE SCALE IS INVERTED and reading it wrong would be worse than not showing it:
// 10 is fully consistent, 1 is a flat contradiction. So a LOW number is SEVERE.
// The line carries a word as well as the number, because a bare "2/10" reads like
// a weak signal to anyone who has not memorised the scale.
//
// Resolved records are left out: they are no longer live. A re-opened one is
// `starred` again and comes back.
const SEVERITY = (level) =>
  level <= 2 ? 'סתירה ישירה' : level <= 4 ? 'אי-הלימה' : 'עמום';

const DIMENSION_HE = { factual: 'עובדתי', emotional: 'רגשי', cognitive: 'קוגניטיבי' };

function contradictionsBlock(state, record, actorMap) {
  const lines = [];
  for (const rec of Object.values(state?.gaps?.byTarget ?? {})) {
    if (!rec || rec.status === 'resolved') continue;
    const dim = DIMENSION_HE[rec.dimension] ?? rec.dimension ?? '';
    const head = `${SEVERITY(rec.level)} (${rec.level}/10${dim ? ` · ${dim}` : ''})`;
    // The pair, when the registrar named one. Falls back to the target plus the
    // note, because a contradiction with unresolvable endpoints is still
    // intelligence the interviewer needs.
    const pair = (rec.between ?? [])
      .map((r) => endpointText(state, record, actorMap, r))
      .filter(Boolean);
    const what = pair.length === 2
      ? `${pair[0]} ↮ ${pair[1]}`
      : (rec.target?.label ?? '');
    const note = rec.note ? ` — ${rec.note}` : '';
    if (what || note) lines.push(`  ${head}: ${what}${note}`);
  }
  if (!lines.length) return '';
  // gap-management §10.2: the asterisk is the default response, not confrontation.
  // The account states the rule beside the data so the two never travel apart.
  return `**סתירות שנרשמו** — מודיעין פנימי, לעולם לא לשקף ולא לעמת:\n${lines.join('\n')}`;
}

// StateDocument → the event as an account for the interviewer's prompt.
// Empty sections are omitted rather than printed as empty headings: an account with
// blanks in it is a form, and a model handed a form fills the form.
export function renderEvent(state, { full = false } = {}) {
  const raw = state?.eventRecord;
  if (!raw) return '';

  // The account is the LEDGER's account. With an empty ledger there is no account,
  // whatever else the document holds — which is what makes this genuinely inert
  // while the registrar is not yet writing, rather than inert-looking. The earlier
  // version leaked a cast section as soon as the INTERVIEWER populated actorMap in
  // stage 1, so the branch changed the live prompt on turn three while claiming to
  // change nothing.
  const s0 = raw.setting ?? {};
  const empty =
    !Object.keys(raw.beats ?? {}).length &&
    !Object.keys(raw.stances ?? {}).length &&
    !Object.keys(raw.emotions ?? {}).length &&
    !has(s0.place) && !has(s0.time) && !has(s0.precedent) && !(s0.conditions ?? []).length;
  if (empty) return '';

  // Redaction, unless the caller is the probe. See the header.
  const keep = (store) =>
    full ? (store ?? {}) : Object.fromEntries(Object.entries(store ?? {}).filter(([, e]) => displayable(e)));
  const record = full
    ? raw
    : { ...raw, beats: keep(raw.beats), stances: keep(raw.stances), emotions: keep(raw.emotions) };

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

  // `record` here is the REDACTED one when full is false, so a relation touching a
  // wound stance resolves to '' and the line is dropped with it.
  const rel = relationsBlock(state, record, actorMap);
  if (rel) parts.push(rel);

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

  // Last, and only for the probe. See the header: summary / opener / board are
  // spoken to the person, and this never goes near them.
  if (full) {
    const clash = contradictionsBlock(state, record, actorMap);
    if (clash) parts.push(clash);
  }

  if (!parts.length) return '';
  return `## המאורע כפי שנאסף עד כה\n${parts.join('\n\n')}`;
}
