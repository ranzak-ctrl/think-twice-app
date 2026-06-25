// Model Adapter — single complete() interface.
// Falls back to mock when VITE_ANTHROPIC_API_KEY is absent or placeholder.
// This is the ONLY file that touches the network.

import { parseResponse } from '../core/responseParser.js';

const isValidKey = (k) => k && k.startsWith('sk-ant-') && k.length > 30 && k !== 'sk-ant-...';

// Scripted mock responses keyed by stage:turn — used in dev (no key) and Vitest.
export const MOCK_RESPONSES = {
  // Stage 1 — Facts
  '1:0': {
    message: 'ספר לי — מה קרה?',
    evaluation: { slots: {}, new_info: false, exhausted: false },
  },
  '1:1': {
    message: 'מי עוד היה שם באותו רגע?',
    evaluation: { slots: { trigger: 2, timeline: 1 }, new_info: true, exhausted: false },
  },
  '1:2': {
    message: 'ומה קרה מיד אחרי?',
    evaluation: { slots: { actors: 2, status: 1 }, new_info: true, exhausted: false },
  },
  '1:3': {
    message: 'איפה זה עומד עכשיו?',
    evaluation: { slots: { timeline: 2, auto_reaction: 1 }, new_info: true, exhausted: false },
  },
  '1:4': {
    message: 'מה עשית ספונטנית באותו רגע, לפני שחשבת?',
    evaluation: { slots: { status: 2, auto_reaction: 2 }, new_info: true, exhausted: false },
  },
  '1:5': {
    message: 'בוא נוודא שהבנתי נכון — הבשר הגיע, הוא אמר שהוא לא איכותי, ואתה עזבת. זה מדויק?',
    evaluation: { slots: {}, new_info: false, exhausted: true },
  },

  // Stage 2 — Interpretation
  '2:0': {
    message: 'למה לדעתך הוא עשה את זה?',
    evaluation: { slots: { causal: 1 }, new_info: true, exhausted: false },
  },
  '2:1': {
    message: 'ואיך אתה מבין את זה — מה זה אומר עליך, בעיניך?',
    evaluation: { slots: { causal: 2, meaning: 1 }, new_info: true, exhausted: false },
  },
  '2:2': {
    message: 'נסה לנסח את זה במשפט שמתחיל ב"אני..."',
    evaluation: { slots: { meaning: 2, wound: 1 }, new_info: true, exhausted: false },
  },
  '2:3': {
    message: 'זה מזכיר לך דפוס מוכר?',
    evaluation: { slots: { wound: 2, adhd_pattern: 2 }, new_info: false, exhausted: true },
  },

  // Stage 3 — Feel
  '3:0': {
    message: 'כשאתה מסתכל על התמונה הזו — איזה רגש זה מעורר?',
    evaluation: { slots: { emotion: 1 }, new_info: true, exhausted: false },
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
    evaluation: { slots: { past_echo: 2 }, new_info: false, exhausted: true },
  },

  // Stage 4 — React
  '4:0': {
    message: 'באותו רגע — מה עשית, לפני שהספקת לחשוב?',
    evaluation: { slots: { auto_reaction: 2 }, new_info: true, exhausted: false },
  },
  '4:1': {
    message: 'ומה אתה שוקל לעשות עכשיו?',
    evaluation: { slots: { planned_reaction: 2 }, new_info: false, exhausted: true },
  },

  // Stage 5 — Transform
  '5:0': {
    message: 'מה הוא ראה מהצד שלו באותו רגע?',
    evaluation: { slots: { perspective: 1 }, new_info: true, exhausted: false },
  },
  '5:1': {
    message: 'מה לדעתך הוא ניסה להשיג?',
    evaluation: { slots: { perspective: 2, intention: 1 }, new_info: true, exhausted: false },
  },
  '5:2': {
    message: 'נסה לנסח את זה במשפט שמתחיל ב"הוא..."',
    evaluation: { slots: { intention: 2, alt_formulation: 1 }, new_info: true, exhausted: false },
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

  // Summary mode — Router decided to transition; return the stage recap and
  // do NOT advance the turn counter (no probing turn was consumed).
  if (mode === 'summary') {
    if (mockSummaryFails) {
      return { ok: false, error: 'mock_summary_failure', message: 'שגיאה בחיבור למודל. נסה שוב.', evaluation: null };
    }
    const message =
      sc.summaries[stage] ??
      'בוא נוודא שהבנתי נכון — עברנו על עיקרי הדברים בשלב הזה. זה מדויק?';
    const raw = JSON.stringify({ message });
    return { ...parseResponse(raw), raw };
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

function mergeUsage(acc, u) {
  if (!u) return acc;
  if (!acc) return { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0 };
  return {
    input_tokens: (acc.input_tokens ?? 0) + (u.input_tokens ?? 0),
    output_tokens: (acc.output_tokens ?? 0) + (u.output_tokens ?? 0),
  };
}

export async function complete({ stage, systemPrompt, messages, mode }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const model = import.meta.env.VITE_MODEL ?? 'claude-sonnet-4-6';

  if (!isValidKey(apiKey) || !systemPrompt || !messages?.length) {
    return mockComplete({ stage, mode });
  }

  let usage = null;
  let attemptMessages = messages;
  let lastFailure = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res;
    try {
      res = await fetch('/api/anthropic/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages: attemptMessages,
        }),
      });
    } catch (err) {
      console.error('Network error:', err);
      return { ok: false, error: err.message, message: 'בעיית תקשורת. בדוק חיבור לאינטרנט.', evaluation: null, usage };
    }

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic API error:', err);
      return { ok: false, error: err, message: 'שגיאה בחיבור למודל. נסה שוב.', evaluation: null, usage };
    }

    const data = await res.json();
    usage = mergeUsage(usage, data.usage);
    const raw = data.content?.[0]?.text ?? '';
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
