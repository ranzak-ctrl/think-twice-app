// Can a real model actually produce the registrar's shape?
//
// Nothing has ever asked. Every registrar test to date uses a mock, so the prompt
// has never been sent to a model and parseRegistrarResponse has never seen a real
// reply. Tonight showed what "never run" is worth: the LLM judge had never once
// scored anything against sonnet-5, and it was broken in two independent ways that
// only a real call could reveal.
//
// The registrar carries the same exposure, and more of it:
//   · parseRegistrarResponse does a plain JSON.parse, and the reply is almost
//     entirely Hebrew free text — labels, notes, a person quoting someone. An
//     unescaped quote is what broke the judge on run 5, and quoting is routine here.
//   · a parse failure is SILENT by design: runRegistrar returns the state
//     untouched so a bad turn never costs the person their turn. Correct, and it
//     means a registrar that fails every turn looks exactly like one that works.
//
// So this is the cheapest thing that answers the only question left: one live call,
// asserting the reply parses into the ledger's shape and is not empty.
//
// Opt-in and paid, gated exactly like the judge: needs a key AND RUN_JUDGE=1, so a
// routine `npm test` skips it and CI runs it in the step that already has both.

import { describe, it, expect } from 'vitest';
import registrarMd from '../../src/content/prompts/registrar.md?raw';
import { parseRegistrarResponse } from '../../src/core/registrar.js';
import { DEFAULT_MODEL } from '../../src/adapters/model.js';

// Two turn-pairs of the meat case. The registrar's raw material is the transcript
// itself (event-model.md §5.2), so it is fed as a transcript, not as an extraction.
const TRANSCRIPT = `מראיין: ספר לי — מה קרה?
מרואיין: הזמנתי משלוח בשר למסעדה. כשהוא הגיע ראיתי שהוא לא באיכות שסיכמנו. אמרתי לספק שזה לא טוב, ופשוט עזבתי את המטבח באמצע המשמרת.
מראיין: מי עוד היה שם באותו רגע?
מרואיין: הסו-שף והספק. שניהם הסתכלו עליי כשיצאתי.`;

const apiKey = process.env.ANTHROPIC_API_KEY;
const hasKey = typeof apiKey === 'string' && apiKey.startsWith('sk-ant-') && apiKey.length > 30;
const runLive = process.env.RUN_JUDGE === '1';

const unfence = (t) => t.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

describe.skipIf(!hasKey || !runLive)('registrar against a real model', () => {
  it(
    'returns JSON that parses into the ledger shape, and is not empty',
    async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          // The model the interview actually runs — not a name pinned here. A live
          // test that calls a different model than production reports green about
          // something nobody ships, which is worse than not running.
          model: DEFAULT_MODEL,
          max_tokens: 4096,
          // Both lessons from the judge, applied before they can bite again:
          // thinking off, and read the block that CARRIES TEXT rather than [0].
          // Omitted on Haiku, where a thinking config is how you turn it ON.
          ...(DEFAULT_MODEL.startsWith('claude-haiku-') ? {} : { thinking: { type: 'disabled' } }),
          system: registrarMd,
          messages: [{ role: 'user', content: TRANSCRIPT }],
        }),
      });

      const body = await res.text();
      expect(res.ok, `registrar call failed → ${body.slice(0, 400)}`).toBe(true);

      const data = JSON.parse(body);
      const raw = data.content?.find((b) => typeof b?.text === 'string')?.text ?? '';
      const parsed = parseRegistrarResponse(raw);
      const d = parsed.deltas ?? {};

      // Emitted before the assertions so it appears on pass and on fail alike —
      // the rule that cost three separate bugs to learn tonight.
      console.log(`REGISTRAR_RESULT ${JSON.stringify({
        ok: parsed.ok,
        error: parsed.error ?? '',
        counts: Object.fromEntries(
          ['beats', 'stances', 'emotions', 'actors', 'edges', 'groups', 'openForks', 'gapObservations']
            .map((k) => [k, (d[k] ?? []).length]),
        ),
        hasSetting: Boolean(d.setting),
        raw: parsed.ok ? '' : raw.slice(0, 500),
      })}`);

      expect(parsed.ok, `reply did not parse → ${parsed.error}`).toBe(true);

      // A model answering `{}` parses fine and records nothing. The registrar's
      // whole job is to come back with the event, so an empty ledger is a failure
      // even though the JSON is valid.
      const total = ['beats', 'stances', 'emotions', 'actors', 'edges']
        .reduce((n, k) => n + (d[k] ?? []).length, 0);
      expect(total, 'parsed, but the registrar recorded nothing at all').toBeGreaterThan(0);

      // The two people named in the transcript are the minimum any reading catches.
      expect(d.actors.length, 'no actors from a transcript that names two').toBeGreaterThan(0);

      // It has no `message` field by design — a structural guarantee it cannot
      // address anyone. If a real model invents one, that guarantee is not real.
      expect(JSON.parse(unfence(raw)).message, 'the registrar invented a `message` field').toBeUndefined();
    },
    60000,
  );
});
