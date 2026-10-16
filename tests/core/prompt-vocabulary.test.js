// Does the prompt teach the vocabulary the code accepts?
//
// Written because it did not, and nothing noticed. vocabulary.js accepted eight
// edge kinds; registrar.md taught three in an example and a fourth in prose. The
// four approved additions (`derives_from` · `about` · `despite` · `alternative_to`)
// were reachable in code and unreachable in practice — the parser would have taken
// them and the model was never told they exist. That failure is SILENT in every
// other test: the graph comes out poorer than what was decided, and nothing is red.
//
// ── WHY THE COVERAGE CHECK IS GATED ON THE SWITCH ──
// With REGISTRAR_ENABLED false the registrar never runs and buildRegistrarPrompt
// returns '', so an untaught kind costs nothing today. Gating the assertion on the
// switch binds it to the moment it bites, instead of leaving a permanently red
// suite that teaches everyone to ignore red. CI runs BOTH states on every dispatch
// (.github/workflows/gates.yml), so the gap still shows up on every single run —
// in the "registrar on" row, which is exactly where it matters.
//
// In other words: this does not let the gap hide. It stops the switch being
// flipped while the prompt cannot emit half of what the code accepts.
//
// ── THE PARENTS' REGISTRAR IS HELD TO THE SAME BAR (prompt-editor, 16.10.2026) ──
// The parents' interview got its own registrar text (parents/registrar.md), and the
// code that reads it is the same pack-generic code, so the same silent failure
// applies to it: a kind it never shows in JSON is a kind its model never emits.
// Checked on the text as the pack maps it — author notes stripped, exactly what
// the model reads — rather than the raw file.

import { describe, it, expect } from 'vitest';
import registrarMd from '../../src/content/prompts/registrar.md?raw';
import evaluatorMd from '../../src/content/prompts/evaluator.md?raw';
import { EDGE_KINDS, GROUP_KINDS } from '../../src/core/vocabulary.js';
import { REGISTRAR_ENABLED } from '../../src/core/promptBuilder.js';
import { thinkTwiceParentsPrompts } from '../../src/packs/think-twice-parents/prompts.js';

// `kind` is not only an edge field: groups carry one, and so do gap targets
// (state.js:658-666). Scraping the field name alone would conflate all three.
const TARGET_KINDS = new Set(['slot', 'topic', 'actor', 'beat', 'fork', 'group']);
const KNOWN = new Set([...EDGE_KINDS, ...GROUP_KINDS, ...TARGET_KINDS]);

// Only what appears in a real JSON example counts. A kind named in prose, or listed
// in a table with its direction, still leaves the model without a shape to copy —
// and copying the shape is how it emits one.
const kindsIn = (md) => new Set([...md.matchAll(/"kind"\s*:\s*"([a-z_]+)"/g)].map((m) => m[1]));

const missingFromRegistrar = () => [...EDGE_KINDS].filter((k) => !kindsIn(registrarMd).has(k));

describe('prompt ↔ vocabulary agreement', () => {
  // GUARD THE GUARD. The ORDERING_KINDS check once scraped a declaration that had
  // become an import, matched nothing, and passed everything. A scraper that finds
  // nothing must fail loudly rather than quietly report agreement.
  it('the scraper actually finds examples in both prompts', () => {
    expect(kindsIn(registrarMd).size, 'registrar.md: no `"kind": "..."` examples found — the scraper is broken or the prompt changed shape').toBeGreaterThan(0);
    expect(kindsIn(evaluatorMd).size, 'evaluator.md: no `"kind": "..."` examples found').toBeGreaterThan(0);
  });

  it.runIf(REGISTRAR_ENABLED)('registrar.md shows every edge kind in an example, now that the registrar runs', () => {
    const missing = missingFromRegistrar();
    expect(missing, `REGISTRAR_ENABLED is on and registrar.md has no JSON example for: ${missing.join(' · ')} — the model will never emit them. Finish registrar.md (prompt-editor owns it) or turn the switch back off with \`npm run registrar:off\`.`).toEqual([]);
  });

  it.skipIf(REGISTRAR_ENABLED)('records which kinds are still untaught while the switch is off', () => {
    // Not an assertion about what SHOULD be — a printed inventory, so the gap is
    // visible in a normal run rather than discovered when the switch is flipped.
    const missing = missingFromRegistrar();
    if (missing.length) {
      console.log(`PROMPT_VOCAB_GAP registrar.md has no JSON example for ${missing.length}/${EDGE_KINDS.size} edge kinds: ${missing.join(' · ')} (blocks REGISTRAR_ENABLED)`);
    }
    expect(missing.every((k) => EDGE_KINDS.has(k))).toBe(true);
  });

  it('neither prompt teaches a kind the code would drop', () => {
    for (const [name, md] of [['registrar.md', registrarMd], ['evaluator.md', evaluatorMd]]) {
      const unknown = [...kindsIn(md)].filter((k) => !KNOWN.has(k));
      expect(unknown, `${name} teaches kinds that mergeEdges/mergeGroups discard silently: ${unknown.join(' · ')}`).toEqual([]);
    }
  });

  // `about` is the one kind whose DIRECTION the code enforces: mergeEdges refuses an
  // `about` whose source is not a mind. A prompt that shows the kind without that
  // rule produces edges that vanish on the way in.
  it('registrar.md states the `about` direction rule the code enforces', () => {
    expect(/about[\s\S]{0,3000}?(תודע|מחשב|נפש|mind|MENTAL_SLOTS)/i.test(registrarMd),
      'registrar.md names `about` but never says its `from` must be a mind — mergeEdges drops the rest').toBe(true);
  });
});

describe('prompt ↔ vocabulary agreement — the parents registrar', () => {
  const parentsRegistrar = thinkTwiceParentsPrompts.registrar;
  const missingFromParents = () => [...EDGE_KINDS].filter((k) => !kindsIn(parentsRegistrar).has(k));

  it('is a text, and the scraper actually finds examples in it', () => {
    expect(typeof parentsRegistrar, 'the parents pack maps no registrar text').toBe('string');
    expect(kindsIn(parentsRegistrar).size, 'parents/registrar.md: no `"kind": "..."` examples found — the scraper is broken or the prompt changed shape').toBeGreaterThan(0);
  });

  it.runIf(REGISTRAR_ENABLED)('shows every edge kind in an example, now that the registrar runs', () => {
    const missing = missingFromParents();
    expect(missing, `parents/registrar.md has no JSON example for: ${missing.join(' · ')} — the model will never emit them. Finish it (prompt-editor owns it).`).toEqual([]);
  });

  it('teaches no kind the code would drop', () => {
    const unknown = [...kindsIn(parentsRegistrar)].filter((k) => !KNOWN.has(k));
    expect(unknown, `parents/registrar.md teaches kinds that mergeEdges/mergeGroups discard silently: ${unknown.join(' · ')}`).toEqual([]);
  });

  it('states the `about` direction rule the code enforces', () => {
    expect(/about[\s\S]{0,3000}?(תודע|מחשב|נפש|mind|MENTAL_SLOTS)/i.test(parentsRegistrar),
      'parents/registrar.md names `about` but never says its `from` must be a mind — mergeEdges drops the rest').toBe(true);
  });
});
