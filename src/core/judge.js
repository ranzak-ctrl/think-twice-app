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

// Validate a bag of candidate scores. Shared by the strict and salvaged paths so
// the two can never drift into judging by different rules.
function collectScores(get) {
  const scores = {};
  for (const dim of JUDGE_DIMENSIONS) {
    const v = get(dim);
    if (typeof v !== 'number' || Number.isNaN(v) || v < 1 || v > 5) {
      return { bad: dim };
    }
    scores[dim] = v;
  }
  return { scores };
}

// Recover the five scores from a reply whose JSON does not parse.
//
// THE CASE THIS EXISTS FOR, from CI run 5 (19.9.2026): the judge returned
// 4/5/5/5/4 and its `notes` quoted the interviewer —
//   "notes": "...חקירת פרשנות ("מה זה אומר עליך"), מדידת עוצמת..."
// Those inner quotes are unescaped, so JSON.parse rejects the whole object and a
// complete, correct set of scores was thrown away over punctuation in a comment
// field. A judge writing Hebrew notes will quote the interviewer constantly, so
// this is the normal case, not an edge one.
//
// Only NUMBERS are salvaged, and that is the point: a number cannot contain a
// quote, so `"empathy": 4` is unambiguous no matter how mangled the prose around
// it is. The same 1–5 validation still applies — this recovers the scores, it does
// not lower the bar for them. Notes are taken only if they can be had safely.
function salvageScores(text) {
  const found = {};
  for (const dim of JUDGE_DIMENSIONS) {
    const m = new RegExp(`"${dim}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
    if (m) found[dim] = Number(m[1]);
  }
  const { scores, bad } = collectScores((d) => found[d]);
  if (bad) return null;

  // Everything after "notes": up to the last quote before the closing brace. Best
  // effort by design: the notes are commentary, the scores are the verdict.
  const n = /"notes"\s*:\s*"([\s\S]*)"\s*,?\s*\}?\s*$/.exec(text.trim());
  return { scores, notes: n ? n[1].trim() : '' };
}

// Parse the judge's JSON. Returns { ok, scores, notes } or { ok:false, error }.
// On a salvaged parse `salvaged` is true, so a malformed reply is still visible
// rather than silently smoothed over.
export function parseJudgeScores(raw) {
  const text = String(raw ?? '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'no_json', raw };

  let obj;
  try {
    obj = JSON.parse(match[0]);
  } catch {
    const rescued = salvageScores(match[0]);
    if (rescued) return { ok: true, ...rescued, salvaged: true };
    return { ok: false, error: 'invalid_json', raw };
  }

  const { scores, bad } = collectScores((d) => obj[d]);
  if (bad) return { ok: false, error: `missing_or_invalid_score:${bad}`, raw };

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
