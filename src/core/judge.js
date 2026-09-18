// LLM-judge harness (dev-plan §132/§154). Scores an interview transcript 1–5 on
// empathy, non-judgmentalism, ownership, active-listening, and natural Hebrew.
// Portable core: the network call takes an injectable fetch + apiUrl so the
// pure parsing/formatting is unit-testable and the real call is gated by a key.

import judgeMd from '../content/prompts/judge.md?raw';

export const JUDGE_DIMENSIONS = [
  'empathy',
  'non_judgment',
  'ownership',
  'active_listening',
  'natural_hebrew',
];

export function buildJudgePrompt() {
  return judgeMd;
}

// Render a {role, content}[] history as a labelled Hebrew transcript.
export function formatTranscript(history) {
  return (history ?? [])
    .filter((m) => m && typeof m.content === 'string')
    .map((m) => `${m.role === 'assistant' ? 'מראיין' : 'מרואיין'}: ${m.content}`)
    .join('\n');
}

// Parse the judge's JSON. Returns { ok, scores, notes } or { ok:false, error }.
export function parseJudgeScores(raw) {
  const text = String(raw ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'no_json', raw };

  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    return { ok: false, error: 'invalid_json', raw };
  }

  const scores = {};
  for (const dim of JUDGE_DIMENSIONS) {
    const v = obj[dim];
    if (typeof v !== 'number' || v < 1 || v > 5) {
      return { ok: false, error: `missing_or_invalid_score:${dim}`, raw };
    }
    scores[dim] = v;
  }
  return { ok: true, scores, notes: typeof obj.notes === 'string' ? obj.notes : '' };
}

// True iff every dimension meets the threshold (default 4).
export function meetsThreshold(scores, threshold = 4) {
  return JUDGE_DIMENSIONS.every((d) => (scores?.[d] ?? 0) >= threshold);
}

// Send a transcript to the judge model. `fetchImpl` and `apiUrl` are injectable
// for testing; the default targets Anthropic directly (works in Node, no proxy).
export async function judgeTranscript({
  history,
  apiKey,
  model = 'claude-sonnet-5',
  fetchImpl = fetch,
  apiUrl = 'https://api.anthropic.com/v1/messages',
}) {
  const transcript = formatTranscript(history);
  const res = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      // Sonnet 5 runs adaptive thinking by default. model.js disables it for the
      // interview and this call needs it off for the same reason: the judge must
      // return a compact JSON envelope, not reasoning, and thinking tokens count
      // against max_tokens.
      thinking: { type: 'disabled' },
      system: judgeMd,
      messages: [{ role: 'user', content: transcript }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false, error: err };
  }

  const data = await res.json();
  // Pick the first block that CARRIES TEXT — never content[0].
  //
  // This is the bug that made the acceptance gate silently unusable, found on the
  // first cloud run (18.9.2026). With thinking on, the reply LEADS with a
  // `thinking` block that has no `.text`, so content[0].text was '' and
  // parseJudgeScores returned `no_json` — which reads like the model answered
  // badly when in fact it was never read. model.js:721 already carried this exact
  // fix and its comment; judge.js never got it, so the judge had never once
  // scored anything against sonnet-5.
  const rawText = data.content?.find((b) => typeof b?.text === 'string')?.text ?? '';
  return parseJudgeScores(rawText);
}
