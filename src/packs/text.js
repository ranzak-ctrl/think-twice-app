// A pack's text as the model reads it: the header out.
//
// Every text under src/content/prompts/ opens with notes the model must never
// read — the version line, what changed, who asked (prompt-editor versions every
// file it touches, so a judge score that drops can be rolled back). The notes are
// HTML comments at the top of the file: one line (`<!-- summary prompt — v1 -->`,
// or the parents' `<!-- # … -->` notes), or one block over many lines (evaluator.md,
// registrar.md), one block or several in a row. Until 24.10.2026 the adult mapping
// handed the files over as they were, headers included, while the parents' mapping
// stripped its own one-line notes — a version history was reaching the model
// (prompt-editor, 24.10.2026, fixing the defect it reported that day).
//
// What is stripped: every comment block at the top of the text, each one `<!--`
// through its first `-->` and alone on its line(s), and the blank lines after the
// last one. Nothing else: a comment further down is not a header. It stays in, and
// the fingerprint tests (tests/core/prompt-fingerprint*.test.js) fail on any `<!--`
// in an assembled prompt — the same stand guidelines.js takes on its files: a
// comment the model could read is always a mistake there, and the test says so
// rather than swallowing it.
//
// NOT for the guidelines (guidelines/super.md and each interview's own file). Those
// open with `<!-- @key -->` markers that guidelines.js parses into blocks; it strips
// their `<!-- # … -->` notes itself. Run through this, the first marker would be
// stripped as a header and the block would be lost.
//
// Lives under src/packs/ and not in src/core: the core imports no text and knows no
// file — a pack hands it strings (principle 4, tests/core/portable-core.test.js) —
// and a pack imports nothing from src/core (src/core/pack.js says why). Imports
// nothing itself. A lazy `[\s\S]*?` and no lookbehind: this runs while the app
// loads, and Safari before 16.4 cannot parse a lookbehind
// (tests/core/browser-support.test.js).
const HEADER = /^(?:\s*<!--[\s\S]*?-->[ \t]*(?:\n|$))+\n*/;

export const text = (md) => md.replace(HEADER, '');
