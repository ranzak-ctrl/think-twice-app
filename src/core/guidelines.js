// Interviewer guidelines — one super file for every Think Twice interviewer, and
// one specific file per interview model that overrides it (Ran, 9.10.2026: "the
// specific file beats the super file").
//
// Both are Markdown divided into keyed blocks by marker lines:
//
//   <!-- @key -->             a block an interview may override
//   <!-- @key locked -->      a block no interview may override   (super file only)
//   <!-- @key required -->    a block every interview must supply (super file only)
//   <!-- # any note -->       an author's note — version, provenance — never sent
//
// Nothing else that looks like a comment is allowed: a line starting with `<!--`
// that is not exactly a marker or a note is an error, and so is a composed text
// that still contains `<!--`. In these files a comment the model can read is always
// a mistake — a marker typed wrong, a note split over two lines.
//
// A block runs from its marker to the next marker. Composition walks the super
// file's blocks in order and takes the specific file's block wherever it has the
// same key; blocks only the specific file has are appended, in its order. Marker
// lines are removed. So the model reads one continuous text and never sees the rule
// an interview replaced: which instruction wins is decided here, in code, not left
// to the model to weigh — principle 1, applied to the guidelines.
//
// What this does NOT guarantee (router-guard, 9.10.2026): a block only the specific
// file has is appended, and nothing stops it from contradicting a super block —
// even a locked one ("@extra: two questions are fine" composes). `locked` protects
// a key from being replaced, not a rule from being argued with. Reading what an
// interview adds is prompt-editor's job, and the turn lint stays the real guard of
// the one-question rule.
//
// Blocks own their whitespace and are concatenated exactly. That is what lets the
// split of the old persona.md reproduce it byte for byte, and it means an override
// should end the way the block it replaces ended (usually with a blank line).
//
// `locked` exists for the rules CLAUDE.md already makes hard for every turn of
// every interview — today, one directed question per turn. Which rules are locked is
// a content decision recorded in the super file itself, not here.
//
// Imports nothing: plain data in, text out (principle 4).

const MARKER = /^<!--\s*@([a-z0-9][a-z0-9-]*)((?:\s+(?:locked|required))*)\s*-->$/;
// One line, by itself, ending at its first `-->`: prompt-editor versions every file
// it touches, and in these files a version line the model could read would change
// what it reads. Not greedy, so `<!-- # a --> text <!-- b -->` is an error rather
// than a note that silently swallows the text between.
const NOTE = /^<!--\s*#(?:(?!-->).)*-->$/;
const COMMENT = /^<!--/;

// Lines, each keeping its own newline. Not split(/(?<=\n)/): a lookbehind is a
// syntax error in Safari before 16.4, and this runs while the app loads — on an
// older iPhone the interview would never have started (router-guard, 9.10.2026).
const lines = (text) => String(text ?? '').match(/[^\n]*\n|[^\n]+$/g) ?? [];

function parse(text, which) {
  const errors = [];
  const blocks = [];
  let preamble = '';
  // Each line keeps its own newline, so bodies concatenate back exactly.
  for (const line of lines(text)) {
    const bare = line.replace(/\r?\n$/, '').trim();
    const m = MARKER.exec(bare);
    if (m) {
      const flags = m[2] ?? '';
      blocks.push({ key: m[1], locked: /\blocked\b/.test(flags), required: /\brequired\b/.test(flags), body: '' });
      continue;
    }
    if (NOTE.test(bare)) continue;
    // A marker typed wrong, or a note that is not one line, would otherwise be
    // sent to the model as text.
    if (COMMENT.test(bare)) {
      errors.push(`${which}: malformed marker or note "${bare}"`);
      continue;
    }
    if (blocks.length) blocks[blocks.length - 1].body += line;
    else preamble += line;
  }
  // Every word belongs to a block, so every word can be found, kept or replaced.
  if (preamble.trim()) errors.push(`${which}: text before the first marker — every line must belong to a keyed block`);
  const seen = new Set();
  for (const b of blocks) {
    if (seen.has(b.key)) errors.push(`${which}: block "${b.key}" appears twice`);
    seen.add(b.key);
    // Blocks are concatenated exactly, so a block that does not end its last line
    // glues the next block onto it — and a "## heading" that follows stops being a
    // heading.
    if (b.body && !b.body.endsWith('\n')) errors.push(`${which}: block "${b.key}" must end with a newline`);
  }
  return { blocks, errors };
}

// Returns { ok, errors, text }. Never throws — composeGuidelines is the throwing form.
export function checkGuidelines(guidelines) {
  const errors = [];
  if (!guidelines || typeof guidelines.super !== 'string' || typeof guidelines.specific !== 'string') {
    return { ok: false, errors: ['guidelines must be { super, specific } texts'], text: '' };
  }
  const sup = parse(guidelines.super, 'super');
  const spec = parse(guidelines.specific, 'specific');
  errors.push(...sup.errors, ...spec.errors);
  if (!sup.blocks.length) errors.push('super: no blocks');

  const superByKey = new Map(sup.blocks.map((b) => [b.key, b]));
  const specByKey = new Map(spec.blocks.map((b) => [b.key, b]));

  for (const b of spec.blocks) {
    if (b.locked || b.required) errors.push(`specific: "${b.key}" — only the super file marks blocks locked or required`);
    if (superByKey.get(b.key)?.locked) errors.push(`specific: "${b.key}" is locked in the super file and cannot be overridden`);
    // An empty override would delete the super's rule in silence — the realistic
    // cause is a forgotten line between two markers. Removing a shared rule for
    // one interview, if that is ever wanted, gets its own explicit marker.
    if (superByKey.has(b.key) && !b.body.trim()) {
      errors.push(`specific: "${b.key}" overrides the super file with nothing — an empty block would silently delete that rule`);
    }
  }
  for (const b of sup.blocks) {
    if (b.required && !specByKey.get(b.key)?.body.trim()) {
      errors.push(`specific: missing the required block "${b.key}"`);
    }
  }

  const text = [
    ...sup.blocks.map((b) => (specByKey.has(b.key) ? specByKey.get(b.key).body : b.body)),
    ...spec.blocks.filter((b) => !superByKey.has(b.key)).map((b) => b.body),
  ].join('');
  // The last line of defence: whatever the parse let through, no comment reaches
  // the model.
  if (text.includes('<!--')) errors.push('the composed guidelines still contain "<!--" — a comment would reach the model');
  return { ok: errors.length === 0, errors, text };
}

export function composeGuidelines(guidelines) {
  const { ok, errors, text } = checkGuidelines(guidelines);
  if (!ok) throw new Error(`Interviewer guidelines cannot be composed — ${errors.join('; ')}`);
  return text;
}
