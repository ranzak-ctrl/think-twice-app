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
    evaluation: { slots: { emotion: 2, intensity: 2 }, new_info: true, exhausted: false },
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
    evaluation: { slots: { alt_formulation: 2, re_emotion: 2 }, new_info: false, exhausted: true },
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
    evaluation: { slots: { sharp_decision: 2 }, new_info: true, exhausted: false },
  },
  '7:3': {
    message: 'מה אתה מרוויח מהבחירה הזו, ומה אתה מוותר עליו?',
    evaluation: { slots: { package_test: 2 }, new_info: false, exhausted: true },
  },
};

const turnCounters = {};

function mockComplete({ stage }) {
  const key = `${stage}:${turnCounters[stage] ?? 0}`;
  const response = MOCK_RESPONSES[key] ?? {
    message: '[Mock: no scripted response for this turn]',
    evaluation: { slots: {}, new_info: false, exhausted: false },
  };
  turnCounters[stage] = (turnCounters[stage] ?? 0) + 1;
  const raw = JSON.stringify(response);
  // Run through parseResponse so mock and real API share the same output shape.
  return { ...parseResponse(raw), raw };
}

export async function complete({ stage, systemPrompt, messages }) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const model = import.meta.env.VITE_MODEL ?? 'claude-sonnet-4-6';

  if (!isValidKey(apiKey) || !systemPrompt || !messages?.length) {
    return mockComplete({ stage });
  }

  try {
    const res = await fetch('/api/anthropic/v1/messages', {
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
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic API error:', err);
      return { ok: false, error: err, message: 'שגיאה בחיבור למודל. נסה שוב.', evaluation: null };
    }

    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    return parseResponse(raw);
  } catch (err) {
    console.error('Network error:', err);
    return { ok: false, error: err.message, message: 'בעיית תקשורת. בדוק חיבור לאינטרנט.', evaluation: null };
  }
}

export function resetMockCounters() {
  Object.keys(turnCounters).forEach((k) => delete turnCounters[k]);
}
