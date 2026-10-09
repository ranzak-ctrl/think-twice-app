// The browsers the app must run on.
//
// router-guard, 9.10.2026: a regex lookbehind (`(?<=…)`, `(?<!…)`) is a syntax
// error in Safari before 16.4 — every iPhone stuck on iOS 15 and earlier. Vite's
// default target includes safari14 and does not rewrite it, and the first one
// arrived in code that runs while the app loads: on those phones the interview
// would never have started, and no test would have said so. This keeps it out of
// everything that ships to the browser.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(js|jsx)$/.test(name) ? [p] : [];
  });
}

// Code without its comments — a comment explaining why a lookbehind left is fine.
const code = (file) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('no regex lookbehind in anything the browser runs', () => {
  for (const file of walk(join(ROOT, 'src'))) {
    it(relative(ROOT, file), () => {
      expect(code(file)).not.toMatch(/\(\?<[=!]/);
    });
  }
});
