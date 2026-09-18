// Model Adapter — single complete() interface.
// Runs the scripted mock when VITE_USE_MOCK=true; otherwise calls the serverless
// proxy at /api/anthropic/v1/messages, which injects ANTHROPIC_API_KEY server-side.
// No API key is ever exposed to the browser — there is no VITE_-prefixed secret.
// This is the ONLY file that touches the network.

import { parseResponse } from '../core/responseParser.js';
import { getAppPassword, clearAppPassword } from './appAuth.js';

// Scripted mock responses keyed by stage:turn — used in dev (no key) and Vitest.
export const MOCK_RESPONSES = {
  // Stage 1 — Facts
  '1:0': {
    message: 'ספר לי — מה קרה?',
    evaluation: { slots: {}, new_info: false, exhausted: false },
  },
  '1:1': {
    message: 'מי עוד היה שם באותו רגע?',
    evaluation: {
      slots: { trigger: 2, timeline: 1 },
      // slot_findings flow the "meat" golden story (mock demo of the guide-mode
      // findings feature; the real API reports these per turn for all stages).
      slot_findings: {
        trigger: ['הבשר שהזמנת הגיע למטבח'],
        timeline: ['בתחילת המשמרת, כשהמשלוח הגיע'],
      },
      // The name of each cube on the story map — a word or two, the THING that
      // happened rather than a prefix of the finding. Ran, 4.9.2026.
      map_labels: { trigger: 'הבשר הגיע', timeline: 'תחילת המשמרת' },
      new_info: true,
      exhausted: false,
    },
  },
  '1:2': {
    message: 'ומה קרה מיד אחרי?',
    evaluation: {
      slots: { actors: 2, status: 1 },
      slot_findings: {
        status: ['יצאת מהמשמרת באמצע'],
      },
      map_labels: { status: 'יצאת באמצע' },
      // Resolved cast (מפת שחקנים) — every character clear → code derives actors=2.
      // Each actor carries their own actions (attribution keeps the user's slot clean).
      actor_map: [
        {
          id: 'user',
          label: 'המשתמש',
          role: 'הטבח שקיבל את הבשר',
          relation: 'עצמו',
          clear: true,
          actions: ['קיבל את משלוח הבשר', 'עזב את המשמרת באמצע'],
        },
        {
          id: 'manager',
          label: 'הממונה',
          role: 'אמר שהבשר לא איכותי',
          relation: 'הבוס במטבח',
          clear: true,
          actions: ['אמר שהבשר לא איכותי'],
        },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '1:3': {
    message: 'איפה זה עומד עכשיו?',
    evaluation: {
      slots: { timeline: 2, auto_reaction: 1 },
      slot_findings: {
        timeline: ['אחרי שנאמר שהבשר לא איכותי'],
        auto_reaction: ['יצאת בלי לומר מילה'],
      },
      map_labels: { timeline: 'אחרי ההערה', auto_reaction: 'יצאת בשתיקה' },
      // Edges he stated (Ran, 5.9.2026): the manager made the remark, and he left
      // BECAUSE of it — he said so, so both are confirmed. An edge nobody stated is
      // reported unconfirmed instead, and becomes the next clarification.
      edges: [
        { from: 'actor:manager', to: 'stage1.timeline', kind: 'agent', confirmed: true },
        { from: 'stage1.timeline', to: 'stage1.auto_reaction', kind: 'because', confirmed: true },
      ],
      // Containers (Ran, 5.9.2026): a community he belongs to, and the process that
      // holds the beats inside it. Both describe the world, not his mind.
      groups: [
        {
          id: 'kitchen',
          label: 'המטבח',
          kind: 'community',
          members: ['actor:user', 'actor:manager'],
          confirmed: true,
        },
        {
          id: 'shift',
          label: 'המשמרת',
          kind: 'process',
          members: ['stage1.trigger', 'stage1.timeline'],
        },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '1:4': {
    message: 'מה עשית ספונטנית באותו רגע, לפני שחשבת?',
    evaluation: {
      slots: { status: 2, auto_reaction: 2 },
      slot_findings: {
        status: ['מאז לא חזרתם לדבר על זה'],
        auto_reaction: ['עזבת את מקום העבודה'],
      },
      map_labels: { status: 'לא דיברתם', auto_reaction: 'עזבת' },
      // An open fork (פיצול לא-מוכרע) — Natali, 29.8.2026. He walked out mid-shift
      // and nobody has spoken since, so whether he still has the job is genuinely
      // undecided IN THE STORY. That is a fact of the case, not the model hedging,
      // and it is exactly the shape the ruling says must be drawable: the question
      // is settled (it really is open), the branches are not.
      open_forks: [
        {
          id: 'job_status',
          question: 'לא סוכם אם אתה חוזר למשמרת',
          options: ['אתה חוזר כרגיל', 'הוא כבר חיפש מחליף'],
          settled: false,
        },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '1:5': {
    message: 'בוא נוודא שהבנתי נכון — הבשר הגיע, הוא אמר שהוא לא איכותי, ואתה עזבת. זה מדויק?',
    evaluation: { slots: {}, new_info: false, exhausted: true },
  },

  // Stage 2 — Interpretation
  '2:0': {
    message: 'למה לדעתך הוא עשה את זה?',
    evaluation: {
      slots: { causal: 1 },
      slot_findings: { causal: ['הוא רצה להראות שהוא מבין באוכל'] },
      // Several cubes out of ONE slot, which is the point of `nodes` (Ran,
      // 5.9.2026: "you stopped creating cubes and only updated the existing
      // ones"). `map_labels` could only ever name one, so a second reading of the
      // same causality overwrote the first instead of standing beside it.
      nodes: [
        { id: 'show_off', label: 'רצה להראות', slot: 'stage2.causal', scale: 'episode' },
        // And the two clocks. This one is not a beat of that evening — it is how
        // the kitchen has been for a while, so it belongs on the ground lane and
        // never on the route.
        { id: 'kitchen_pressure', label: 'המטבח תמיד בלחץ', slot: 'stage2.causal', scale: 'ongoing' },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '2:1': {
    message: 'ואיך אתה מבין את זה — מה זה אומר עליך, בעיניך?',
    evaluation: {
      slots: { causal: 2, meaning: 1 },
      slot_findings: { meaning: ['שאני לא מקצועי מספיק'] },
      map_labels: { meaning: 'לא מקצועי' },
      nodes: [
        { id: 'not_pro', label: 'לא מקצועי מספיק', slot: 'stage2.meaning', scale: 'ongoing' },
      ],
      edges: [
        // Suspected but not stated by him, so unconfirmed: it does not redraw the
        // map, it queues the clarification.
        { from: 'stage2.meaning', to: 'stage3.emotion', kind: 'because' },
        // A beat pointing AT a character — the shape that used to be stored and
        // drawn nowhere (Ran, 5.9.2026: "the relation between my wife and the
        // description of her character traits"). He said the remark was about the
        // manager's own standard, so it is confirmed.
        { from: 'show_off', to: 'actor:manager', kind: 'because', confirmed: true },
        // And the arrow between the two clocks: the standing pressure is why he
        // read the remark the way he did in that moment.
        { from: 'kitchen_pressure', to: 'stage1.timeline', kind: 'because', confirmed: true },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '2:2': {
    message: 'נסה לנסח את זה במשפט שמתחיל ב"אני..."',
    evaluation: {
      slots: { meaning: 2, wound: 1 },
      // `wound` is seeded here ON PURPOSE. It must show in the guide panel and must
      // NEVER show in the story mirror — CLAUDE.md and Natali's 14.8 ruling: the
      // person reaches the מוגלה himself and it is never reflected back at him as
      // our reading of him. Keeping it in the mock means a dev running the app in
      // mock mode would SEE the leak if src/core/story.js ever stopped excluding it,
      // instead of trusting the unit test alone. Same for adhd_pattern below.
      slot_findings: { wound: ['אני לא שווה כלום'] },
      new_info: true,
      exhausted: false,
    },
  },
  '2:3': {
    message: 'זה מזכיר לך דפוס מוכר?',
    evaluation: {
      slots: { wound: 2, adhd_pattern: 2 },
      slot_findings: { adhd_pattern: ['קושי בוויסות בסערת רגע — מוכר לך מזמן'] },
      new_info: false,
      exhausted: true,
    },
  },

  // Stage 3 — Feel
  '3:0': {
    message: 'כשאתה מסתכל על התמונה הזו — איזה רגש זה מעורר?',
    evaluation: {
      slots: { emotion: 1 },
      slot_findings: { emotion: ['עלבון'] },
      map_labels: { emotion: 'עלבון' },
      // He confirmed it this turn — the same edge, raised. Reported as a delta.
      edges: [{ from: 'stage2.meaning', to: 'stage3.emotion', kind: 'because', confirmed: true }],
      new_info: true,
      exhausted: false,
    },
  },
  '3:1': {
    message: 'כמה חזק, מ-1 עד 10?',
    evaluation: {
      slots: { emotion: 2, intensity: 2 },
      new_info: true,
      exhausted: false,
      emotion_intensity: 8,
    },
  },
  '3:2': {
    message: 'מזכיר לך משהו מהעבר?',
    evaluation: {
      slots: { past_echo: 2 },
      slot_findings: { past_echo: ['ככה הרגשת כשהמורה העיר לך מול הכיתה'] },
      map_labels: { past_echo: 'המורה מול הכיתה' },
      new_info: false,
      exhausted: true,
    },
  },

  // Stage 4 — React
  '4:0': {
    message: 'באותו רגע — מה עשית, לפני שהספקת לחשוב?',
    evaluation: {
      slots: { auto_reaction: 2 },
      // The first line repeats stage 1's auto_reaction verbatim — the same fact,
      // collected twice, which is what actually happens when stage 4 revisits the
      // reaction stage 1 recorded. The mirror folds the two slots into one scene
      // and de-duplicates, so this exercises that live rather than only in a test.
      slot_findings: { auto_reaction: ['יצאת בלי לומר מילה', 'לא חזרת עד סוף המשמרת'] },
      map_labels: { auto_reaction: 'לא חזרת' },
      new_info: true,
      exhausted: false,
    },
  },
  '4:1': {
    message: 'ומה אתה שוקל לעשות עכשיו?',
    evaluation: {
      slots: { planned_reaction: 2 },
      slot_findings: { planned_reaction: ['לדבר איתו על מה שקרה'] },
      map_labels: { planned_reaction: 'לדבר איתו' },
      new_info: false,
      exhausted: true,
    },
  },

  // Stage 5 — Transform
  '5:0': {
    message: 'מה הוא ראה מהצד שלו באותו רגע?',
    evaluation: {
      slots: { perspective: 1 },
      slot_findings: { perspective: ['הוא היה בלחץ של שירות ערב'] },
      map_labels: { perspective: 'לחץ של ערב' },
      new_info: true,
      exhausted: false,
    },
  },
  '5:1': {
    message: 'מה לדעתך הוא ניסה להשיג?',
    evaluation: {
      slots: { perspective: 2, intention: 1 },
      slot_findings: { intention: ['שהמנה תצא כמו שצריך'] },
      map_labels: { intention: 'שהמנה תצא' },
      new_info: true,
      exhausted: false,
    },
  },
  '5:2': {
    message: 'נסה לנסח את זה במשפט שמתחיל ב"הוא..."',
    evaluation: {
      slots: { intention: 2, alt_formulation: 1 },
      slot_findings: { alt_formulation: ['הוא ניסה להציל את השירות, לא להעליב אותך'] },
      map_labels: { alt_formulation: 'להציל את השירות' },
      // Two perspectives, confirmed with him (Ran, 5.9.2026). Stage 5 is the move
      // out of his own view, and this is what makes the line visible: what he
      // could see from the kitchen floor, and what the manager was dealing with.
      groups: [
        {
          id: 'view-mine',
          label: 'מה שראית',
          kind: 'perspective',
          owner: 'self',
          members: ['stage1.trigger', 'stage1.timeline'],
          confirmed: true,
        },
        {
          id: 'view-his',
          label: 'מה שהוא ראה',
          kind: 'perspective',
          owner: 'actor:manager',
          members: ['stage5.perspective', 'stage5.intention'],
          confirmed: true,
        },
      ],
      new_info: true,
      exhausted: false,
    },
  },
  '5:3': {
    message: 'כשאתה מסתכל על זה ככה — כמה חזק הרגש עכשיו, מ-1 עד 10?',
    evaluation: {
      slots: { alt_formulation: 2, re_emotion: 2 },
      new_info: false,
      exhausted: true,
      emotion_intensity: 4,
    },
  },

  // Stage 6 — Alternatives
  '6:0': {
    message: 'מה עוד אפשר לעשות?',
    evaluation: { slots: { alternatives: 1 }, new_info: true, exhausted: false },
  },
  '6:1': {
    message: 'עוד?',
    evaluation: { slots: { alternatives: 2, zero_action: 1 }, new_info: true, exhausted: false },
  },
  '6:2': {
    message: 'מה לגבי האפשרות של לא לעשות כלום?',
    evaluation: { slots: { zero_action: 2, alt_from_transform: 2 }, new_info: false, exhausted: true },
  },

  // Stage 7 — Decision
  '7:0': {
    message: 'לפני שנסתכל על האפשרויות — מה אתה בעצם רוצה שיקרה?',
    evaluation: { slots: { goal: 2 }, new_info: true, exhausted: false },
  },
  '7:1': {
    message: 'הנה האפשרויות שאספנו. מה מדבר אליך?',
    evaluation: { slots: { board_presented: 2 }, new_info: false, exhausted: false },
  },
  '7:2': {
    message: 'במה אתה בוחר?',
    evaluation: {
      slots: { sharp_decision: 2 },
      new_info: true,
      exhausted: false,
      decision_type: 'sharp',
      differs_from_automatic: true,
    },
  },
  '7:3': {
    message: 'מה אתה מרוויח מהבחירה הזו, ומה אתה מוותר עליו?',
    evaluation: { slots: { package_test: 2 }, new_info: false, exhausted: true },
  },
};

// Stage recaps returned in summary mode (mode: 'summary'). The Router decides
// when a transition is due; this is the recap the user confirms. Flavoured to
// the "meat" golden script, consistent with MOCK_RESPONSES.
export const MOCK_SUMMARIES = {
  1: 'בוא נוודא שהבנתי נכון — הבשר הגיע, הוא אמר שהוא לא איכותי, ואתה עזבת את העבודה. זה מדויק?',
  2: 'בוא נוודא שהבנתי נכון — הבנת את זה כאילו אתה לא מספיק טוב, וזה נגע במשהו מוכר. זה מדויק?',
  3: 'בוא נוודא שהבנתי נכון — מה שעלה היה עלבון חזק, בעוצמה גבוהה, והוא הזכיר לך משהו מהעבר. זה מדויק?',
  4: 'בוא נוודא שהבנתי נכון — באותו רגע עזבת בלי לומר מילה, ועכשיו אתה שוקל איך להגיב. זה מדויק?',
  5: 'בוא נוודא שהבנתי נכון — ניסחת איך זה נראה מהצד שלו, והרגש ירד קצת כשהסתכלת ככה. זה מדויק?',
  6: 'בוא נוודא שהבנתי נכון — אספנו כמה דרכים אפשריות להגיב, כולל לא לעשות כלום. זה מדויק?',
};

// Decision board rows returned in board mode (mode: 'board'). The Router decides
// when to show the board; the code owns and renders it. Meat golden script.
export const MOCK_BOARD = [
  { option: 'לדבר איתו ישירות על מה שקרה', pro: 'מנקה את האוויר', con: 'עלול להסלים' },
  { option: 'לכתוב לו הודעה מנוסחת', pro: 'שליטה בניסוח', con: 'פחות אישי' },
  { option: 'לא לעשות כלום ולהמשיך הלאה', pro: 'חוסך עימות', con: 'משאיר את זה פתוח בפנים' },
];

// --- Additional golden scripts (dev-plan §131: 4 scripts reach a sharp close) ---
// The probing questions above are story-agnostic, so each extra scenario REUSES
// meat's proven slot mechanics and only swaps the shown content (stage recaps +
// board), the closure type, and KPI flavour. This guards the pipeline against
// regressions for differently-shaped interviews; true clinical golden transcripts
// are validated against the live API (LLM-judge + Natali), not the mock.

// Clone meat's responses, merging per-key evaluation overrides; `extras` adds
// turns beyond meat's keys (e.g., a vague→sharp stage-7 tail).
function buildResponses(evalOverrides = {}, extras = {}) {
  const responses = {};
  for (const [key, base] of Object.entries(MOCK_RESPONSES)) {
    responses[key] = evalOverrides[key]
      ? { message: base.message, evaluation: { ...base.evaluation, ...evalOverrides[key] } }
      : base;
  }
  return { ...responses, ...extras };
}

// "חבר בא להתייעץ" — friend consults; user jumps in to fix. Sharp close.
const FRIEND_SUMMARIES = {
  1: 'בוא נוודא שהבנתי נכון — חבר בא להתייעץ, ואתה קפצת מיד לתת פתרון. זה מדויק?',
  2: 'בוא נוודא שהבנתי נכון — הבנת את זה כאילו אתה חייב לתקן הכול בשבילו. זה מדויק?',
  3: 'בוא נוודא שהבנתי נכון — עלתה אי-נוחות כשלא היה לך מה לתת. זה מדויק?',
  4: 'בוא נוודא שהבנתי נכון — לקחת פיקוד על השיחה במקום להקשיב. זה מדויק?',
  5: 'בוא נוודא שהבנתי נכון — ניסחת מה הוא בעצם ביקש, וזה ריכך את הלחץ. זה מדויק?',
  6: 'בוא נוודא שהבנתי נכון — אספנו כמה דרכים להיות שם בשבילו, כולל פשוט להקשיב. זה מדויק?',
};
const FRIEND_BOARD = [
  { option: 'להקשיב בלי לתת פתרון', pro: 'נותן לו מקום', con: 'דורש ריסון' },
  { option: 'לשאול אותו מה הוא צריך ממך', pro: 'מדויק לצורך שלו', con: 'פחות אינטואיטיבי לך' },
  { option: 'לשתף מניסיון שלך בקצרה', pro: 'אותנטי', con: 'עלול להחזיר את הפוקוס אליך' },
];

// "המורה אמר שאני בעייתי" — identity wound. Structured-deferral close.
const TEACHER_SUMMARIES = {
  1: 'בוא נוודא שהבנתי נכון — המורה אמר שאתה בעייתי, וזה תפס אותך לא מוכן. זה מדויק?',
  2: 'בוא נוודא שהבנתי נכון — הבנת את זה כאילו יש בך משהו פגום. זה מדויק?',
  3: 'בוא נוודא שהבנתי נכון — עלתה בושה חזקה, שהזכירה הערות מהעבר. זה מדויק?',
  4: 'בוא נוודא שהבנתי נכון — נסגרת ולא הגבת באותו רגע. זה מדויק?',
  5: 'בוא נוודא שהבנתי נכון — ניסחת מה אולי המורה ניסה לומר, והבושה התרככה מעט. זה מדויק?',
  6: 'בוא נוודא שהבנתי נכון — אספנו כמה דרכים להגיב, כולל לא להגיב מיד. זה מדויק?',
};
const TEACHER_BOARD = [
  { option: 'לבקש שיחה עם המורה', pro: 'מברר ישירות', con: 'חושף אותך' },
  { option: 'לכתוב מה שאתה מרגיש ולחכות יומיים', pro: 'זמן להתבהר', con: 'דוחה את העימות' },
  { option: 'לשתף מישהו קרוב לפני שתחליט', pro: 'פרספקטיבה נוספת', con: 'תלוי בזמינות שלו' },
];

// "חברה אמרה שאין לה זמן" — rejection sensitivity. Vague→sharp close (proves the
// vague guard end to end: the session does NOT close on a vague answer even when
// both closing slots are at 2).
const BUSY_SUMMARIES = {
  1: 'בוא נוודא שהבנתי נכון — חברה אמרה שאין לה זמן, וזה צרב. זה מדויק?',
  2: 'בוא נוודא שהבנתי נכון — הבנת את זה כאילו אתה לא מספיק חשוב לה. זה מדויק?',
  3: 'בוא נוודא שהבנתי נכון — עלתה דחייה חזקה, מוכרת ממקומות אחרים. זה מדויק?',
  4: 'בוא נוודא שהבנתי נכון — הגבת בריחוק פתאומי ממנה. זה מדויק?',
  5: 'בוא נוודא שהבנתי נכון — ניסחת מה אולי עבר עליה, והעקיצה פחתה. זה מדויק?',
  6: 'בוא נוודא שהבנתי נכון — אספנו כמה דרכים להגיב, כולל לתת לזה לנוח. זה מדויק?',
};
const BUSY_BOARD = [
  { option: 'לומר לה ישירות שזה פגע', pro: 'כן ופתוח', con: 'חושף פגיעוּת' },
  { option: 'להציע זמן אחר להיפגש', pro: 'מעשי', con: 'לא נוגע ברגש' },
  { option: 'לתת לזה לנוח כמה ימים', pro: 'מצנן', con: 'משאיר אי-ודאות' },
];

const SCENARIOS = {
  meat: { responses: MOCK_RESPONSES, summaries: MOCK_SUMMARIES, board: MOCK_BOARD },
  friend: {
    responses: buildResponses({
      '3:1': { emotion_intensity: 6 },
      '5:3': { emotion_intensity: 3 },
      '7:2': { differs_from_automatic: true },
    }),
    summaries: FRIEND_SUMMARIES,
    board: FRIEND_BOARD,
  },
  teacher: {
    responses: buildResponses({
      '7:2': { decision_type: 'structured_deferral', differs_from_automatic: true },
    }),
    summaries: TEACHER_SUMMARIES,
    board: TEACHER_BOARD,
  },
  busyFriend: {
    responses: buildResponses(
      {
        '3:1': { emotion_intensity: 9 },
        '5:3': { emotion_intensity: 5 },
        '7:2': { decision_type: 'vague', differs_from_automatic: null },
        '7:3': { decision_type: 'vague' },
      },
      {
        // Tail turn: the user finally sharpens, so the session can close.
        '7:4': {
          message: 'אז כשאתה אומר את זה ברור — במה אתה בוחר?',
          evaluation: {
            slots: {},
            new_info: false,
            decision_type: 'sharp',
            differs_from_automatic: true,
          },
        },
      }
    ),
    summaries: BUSY_SUMMARIES,
    board: BUSY_BOARD,
  },
};

let activeScenario = 'meat';

// Test-only: select which golden script the mock plays (default 'meat').
export function setMockScenario(name) {
  activeScenario = SCENARIOS[name] ? name : 'meat';
}

// Test-only: force summary-mode generation to fail (simulates a rate-limit / API
// error) so the summary-resilience path is testable. (docs/test-plan.md §א.3)
let mockSummaryFails = false;
export function setMockSummaryFailure(fails) {
  mockSummaryFails = !!fails;
}

export { SCENARIOS };

const turnCounters = {};

function mockComplete({ stage, mode }) {
  const sc = SCENARIOS[activeScenario] ?? SCENARIOS.meat;

  // Opener mode — stage transition. The mock has no live story to anchor to, so
  // signal failure and let the caller fall back to the static signpost (keeps dev
  // and tests deterministic; the anchored opener is a real-API behavior).
  if (mode === 'opener') {
    return { ok: false, error: 'mock_no_opener', message: null, evaluation: null };
  }

  // Summary mode — Router decided to transition; return the stage recap and
  // do NOT advance the turn counter (no probing turn was consumed).
  if (mode === 'summary') {
    if (mockSummaryFails) {
      return { ok: false, error: 'mock_summary_failure', message: 'שגיאה בחיבור למודל. נסה שוב.', evaluation: null };
    }
    const message =
      sc.summaries[stage] ??
      'בוא נוודא שהבנתי נכון — עברנו על עיקרי הדברים בשלב הזה. זה מדויק?';
    return { ok: true, message, evaluation: null }; // summary mode = plain text (no JSON)
  }

  // Registrar mode — assembles the event, never speaks. It has no scripted mock
  // story: the golden scripts are transcripts of an INTERVIEW, and inventing a
  // registrar report for them would test the fixture rather than the registrar.
  // An empty report keeps every existing test on its current path, and the real
  // behaviour is exercised in tests/core/registrar.test.js against an injected
  // completeImpl. It does NOT advance the turn counter — no probing turn was spent.
  if (mode === 'registrar') {
    return { ok: true, raw: '{}', message: null, evaluation: null };
  }

  // Board mode — Router returned SHOW_BOARD; return the synthesised board.
  if (mode === 'board') {
    const raw = JSON.stringify({
      message: 'הנה האפשרויות שאספנו, במילים שלך. במה אתה בוחר?',
      evaluation: { board: sc.board },
    });
    return { ...parseResponse(raw), raw };
  }

  const key = `${stage}:${turnCounters[stage] ?? 0}`;
  const response = sc.responses[key] ?? {
    message: '[Mock: no scripted response for this turn]',
    evaluation: { slots: {}, new_info: false, exhausted: false },
  };
  turnCounters[stage] = (turnCounters[stage] ?? 0) + 1;
  const raw = JSON.stringify(response);
  // Run through parseResponse so mock and real API share the same output shape.
  return { ...parseResponse(raw), raw };
}

// JSON-stability retry (dev-plan §148): the model occasionally returns prose or a
// broken object. On a parse failure we show the model its own raw output and ask
// for a clean object, up to MAX_ATTEMPTS total. HTTP/network errors fail fast — a
// 4xx won't fix itself on resend. Token usage is summed across attempts so the
// cost meter stays accurate even when a turn took more than one call.
const MAX_ATTEMPTS = 3;
const REPAIR_NUDGE =
  'הפלט הקודם לא היה JSON תקין. החזר אך ורק אובייקט JSON יחיד בפורמט ' +
  '{"message": "...", "evaluation": {...}} — בלי טקסט נוסף ובלי code fences.';

// Carries all four token buckets, not just input/output. With prompt caching on,
// `input_tokens` is only the UNCACHED remainder — the full prompt is
// input + cache_creation + cache_read. Dropping the cache fields would make the
// meter under-report cost and, worse, hide the one signal that tells you caching
// is working at all: cache_read staying at 0 means something is invalidating the
// prefix. These are absent from the response until caching is enabled, so they
// default to 0 and change nothing today.
function mergeUsage(acc, u) {
  if (!u) return acc;
  const pick = (o) => ({
    input_tokens: o.input_tokens ?? 0,
    output_tokens: o.output_tokens ?? 0,
    cache_creation_input_tokens: o.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: o.cache_read_input_tokens ?? 0,
  });
  if (!acc) return pick(u);
  const a = pick(acc);
  const b = pick(u);
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  };
}

export async function complete({ stage, systemPrompt, messages, mode }) {
  const model = import.meta.env.VITE_MODEL ?? 'claude-sonnet-5';
  // Mock mode is explicit: VITE_USE_MOCK=true (local dev + tests). Anything else
  // runs live against the serverless proxy, which holds the key server-side.
  const live = import.meta.env.VITE_USE_MOCK !== 'true';

  if (!live || !systemPrompt || !messages?.length) {
    return mockComplete({ stage, mode });
  }

  let usage = null;
  let attemptMessages = messages;
  let lastFailure = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      // The client sends NO key, in any environment — the serverless proxy
      // injects ANTHROPIC_API_KEY. Only the shared app password travels here.
      const headers = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      };
      const appPw = getAppPassword();
      if (appPw) headers['x-app-password'] = appPw;

      res = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          // Sonnet 5 runs adaptive thinking by default; thinking tokens count
          // against max_tokens and add cost/latency. This flow wants a compact
          // JSON envelope, not reasoning — keep it off.
          thinking: { type: 'disabled' },
          system: systemPrompt,
          messages: attemptMessages,
        }),
      });
    } catch (err) {
      console.error('Network error:', err);
      return { ok: false, error: err.message, message: 'בעיית תקשורת. בדוק חיבור לאינטרנט.', evaluation: null, usage };
    }

    // 401 is the proxy rejecting the shared access password, not the model
    // failing. It gets its own outcome so the UI can ask for the password
    // instead of showing "model error" over a door that is simply locked.
    if (res.status === 401) {
      clearAppPassword();
      return {
        ok: false,
        error: 'unauthorized',
        unauthorized: true,
        message: 'צריך סיסמת גישה כדי להמשיך.',
        evaluation: null,
        usage,
      };
    }

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic API error:', err);
      return { ok: false, error: err, message: 'שגיאה בחיבור למודל. נסה שוב.', evaluation: null, usage };
    }

    const data = await res.json();
    usage = mergeUsage(usage, data.usage);
    // Pick the first block that carries text — never assume content[0]. Models
    // with thinking on (sonnet-5 default) lead with a `thinking` block, which
    // has no `text`; reading content[0].text there yields '' -> no_json.
    const raw = data.content?.find((b) => typeof b?.text === 'string')?.text ?? '';
    // Summary / opener modes are plain prose — no JSON to parse (the model's natural
    // text can't fail a JSON parse; live symptom of forcing JSON here was no_json).
    // The registrar returns JSON with NO `message` field — that absence is the
    // structural guarantee it cannot address anyone (registrar.js). parseResponse
    // requires `message` and would reject every well-formed registrar reply, then
    // retry it twice more behind REPAIR_NUDGE: three serial API calls per turn, in
    // front of a waiting person, for nothing. Hand the text back unparsed and let
    // parseRegistrarResponse read it.
    if (mode === 'registrar') {
      return { ok: true, raw, message: null, evaluation: null, usage };
    }
    if (mode === 'summary' || mode === 'opener') {
      const message = raw.trim();
      return message
        ? { ok: true, message, evaluation: null, usage }
        : { ok: false, error: `empty_${mode}`, message: 'שגיאה בעיבוד התשובה. נסה שוב.', evaluation: null, usage };
    }
    const parsed = parseResponse(raw);
    if (parsed.ok) return { ...parsed, usage };

    // Parse failed — feed the broken turn back with a repair nudge and retry.
    lastFailure = parsed;
    attemptMessages = [
      ...attemptMessages,
      { role: 'assistant', content: raw },
      { role: 'user', content: REPAIR_NUDGE },
    ];
  }

  console.error('JSON parse failed after', MAX_ATTEMPTS, 'attempts:', lastFailure?.error);
  return {
    ok: false,
    error: lastFailure?.error ?? 'parse_failed',
    message: 'שגיאה בעיבוד התשובה. נסה שוב.',
    evaluation: null,
    usage,
  };
}

export function resetMockCounters() {
  Object.keys(turnCounters).forEach((k) => delete turnCounters[k]);
}
