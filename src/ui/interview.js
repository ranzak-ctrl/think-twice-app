// The interview this shell runs — composed here, and only here.
//
// The engine imports no pack, no prompt and no model adapter (principle 4, see
// src/core/engine.js); this is where the browser build wires them together: the
// pack's structure, its texts as Vite loads them, and the adapter that calls the
// serverless proxy. Everything in the UI that drives the interview goes through
// this one object, so the interview is chosen in one place. (importState is the
// exception, and pack-agnostic: it restores a document, it routes nothing. Since
// 9.10.2026 exports record which interview and version they came from, and App's
// import handler loads only this interview at this version — see sessionExport.js.)
//
// ── WHICH INTERVIEW: THE ADDRESS, UNTIL THERE ARE ACCOUNTS ──
// Two interviews today. Choosing one per user at login is the shell's job in phase 4
// of docs/interview-platform-plan.md (§2א). Until accounts exist, the page's own
// address chooses: `?interview=parents` runs the parents' interview, anything else
// runs Think Twice for adults (Ran, 16.10.2026: bring the parents' interview up on
// the QA link). On the QA build a page whose address names NO interview shows the
// choice of the two first (interviewChoiceNeeded, InterviewChoice.jsx), so one link
// serves both (Ran, 16.10.2026). The choice is read once, when the page loads, and a
// page runs one interview for its whole life — switching is a new address, which is
// a reload, which is also what erases an interview from the browser.

import { createEngine } from '../core/engine.js';
import { complete } from '../adapters/model.js';
import { thinkTwiceAdult } from '../packs/think-twice-adult/pack.js';
import { thinkTwiceAdultPrompts } from '../packs/think-twice-adult/prompts.js';
import { thinkTwiceAdultMigrations } from '../packs/think-twice-adult/migrations.js';
import { thinkTwiceParents } from '../packs/think-twice-parents/pack.js';
import { thinkTwiceParentsPrompts } from '../packs/think-twice-parents/prompts.js';
import { thinkTwiceParentsMigrations } from '../packs/think-twice-parents/migrations.js';

// What the shell says before the interviewer does, per interview: the first turn,
// and the preamble pinned under the header until the first answer (Preamble.jsx).
// Interface copy, not prompt content — the model never reads either.
const COPY = {
  [thinkTwiceAdult.id]: {
    // Ran's wording, revised 15.8.2026 (see App.jsx on why the frame left the turn).
    opening: 'אז ספר לי — מה קרה?',
    preamble:
      'אם קרה משהו שהסעיר אותך והוא עדיין רץ לך בראש — כאן המקום לעבור עליו לאט. ' +
      'נתחיל ממה שקרה בפועל, נמשיך להבין למה זה תפס אותך ככה, ונתקדם יחד אל ' +
      'הנקודה שתוכל/י לבחור את התגובה הכי נכונה עבורך. אני מוביל, שואל שאלה אחת ' +
      'בכל פעם, ובסוף הראיון תוכל/י לקבל החלטה מושכלת.',
  },
  [thinkTwiceParents.id]: {
    // DRAFT for QA. The preamble follows the contract the approval doc offers
    // Natali ("אני אעבור איתך על מה שקרה, צעד אחר צעד…"), which she has not
    // approved yet. Both stay neutral in gender until the parent's words say it.
    opening: 'מה קרה בבית, מהרגע שזה התחיל?',
    preamble:
      'קרה משהו בבית, בינך לבין הילד? כאן עוברים על זה צעד אחר צעד. ' +
      'נבין יחד מה עבר עליו ואיפה זה פגש אותך, ונבנה מה עושים בפעם הבאה. ' +
      'אני מוביל, ושואל שאלה אחת בכל פעם.',
    // Shown beside the logo, so whoever tests it knows which interview they are in.
    badge: 'הורים · טיוטה לבדיקה',
  },
};

const INTERVIEWS = {
  [thinkTwiceAdult.id]: { pack: thinkTwiceAdult, prompts: thinkTwiceAdultPrompts, migrations: thinkTwiceAdultMigrations },
  [thinkTwiceParents.id]: {
    pack: thinkTwiceParents,
    prompts: thinkTwiceParentsPrompts,
    migrations: thinkTwiceParentsMigrations,
  },
};

// Short names for the address; the full id works as well.
const ALIASES = { adult: thinkTwiceAdult.id, parents: thinkTwiceParents.id };

// ── THE PARENTS' INTERVIEW OPENS ONLY ON THE QA LINK ──
// Its safety layer is the adult one: acute distress of the person typing. What a
// parent may describe — hurting the child, a child who said he wants to die — is
// the parents' safety profile, which the plan requires before any tester and
// which waits on Natali (interview-model.md §7, question 7) and on a legal
// question about reporting. Until it exists, the parents' interview runs in a
// Vercel Preview build (the QA link) and in local development, never in
// production (router-guard, 16.10.2026). The flag is set at build time
// (vite.config.js); anywhere it is not set, the parents' interview is not offered.
// And, belt and braces, never on the production address itself — in case a
// Preview bundle were ever promoted without being rebuilt.
const PRODUCTION_HOSTS = ['think-twice-nine.vercel.app'];
const onProductionHost = () =>
  typeof window !== 'undefined' && PRODUCTION_HOSTS.includes(window.location?.hostname);
const PARENTS_ALLOWED =
  !onProductionHost() &&
  (import.meta.env?.MODE !== 'production' ||
    (typeof __PREVIEW_DEPLOYMENT__ !== 'undefined' && __PREVIEW_DEPLOYMENT__ === true));

// The short name an address asks for, or null.
const askedIn = (search) => {
  try {
    return new URLSearchParams(search ?? '').get('interview');
  } catch {
    return null;
  }
};

// The QA choice: a page that is offered both interviews and whose address names
// neither shows the choice first. Production offers only the adult interview, so
// it never shows the choice.
export function interviewChoiceNeeded(search, { allowParents = PARENTS_ALLOWED } = {}) {
  if (!allowParents) return false;
  const id = ALIASES[askedIn(search)] ?? askedIn(search);
  return !INTERVIEWS[id];
}

// The address a choice links to: the same page, with the chosen interview named, and
// every other parameter kept (a share token, for one).
export function choiceHref(search, alias) {
  const params = new URLSearchParams(search ?? '');
  params.set('interview', alias);
  return `?${params.toString()}`;
}

// The interview an address asks for. Unknown or absent → the adult interview,
// so every link that ever worked still opens what it opened.
export function interviewIdFrom(search, { allowParents = PARENTS_ALLOWED } = {}) {
  let asked = null;
  try {
    asked = new URLSearchParams(search ?? '').get('interview');
  } catch {
    asked = null;
  }
  const id = ALIASES[asked] ?? asked;
  if (id === thinkTwiceParents.id && !allowParents) return thinkTwiceAdult.id;
  return INTERVIEWS[id] ? id : thinkTwiceAdult.id;
}

const chosen = INTERVIEWS[interviewIdFrom(typeof window !== 'undefined' ? window.location?.search : '')];

export const interview = createEngine({
  pack: chosen.pack,
  prompts: chosen.prompts,
  complete,
});

// How a person's interview file from an earlier version of this interview is
// brought up to this one (sessionExport.js, upgradeSession). Chosen with the
// interview, in the same place, so the two can never belong to different packs.
export const interviewMigrations = chosen.migrations;

// The shell's own words for this interview.
export const interviewCopy = COPY[chosen.pack.id];

// The address that opens a given interview — for the message that tells a person
// their file belongs to the other one.
export const addressFor = (id) => {
  const alias = Object.keys(ALIASES).find((k) => ALIASES[k] === id);
  return alias && id !== thinkTwiceAdult.id ? `?interview=${alias}` : '';
};
