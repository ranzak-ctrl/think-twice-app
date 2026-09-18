#!/bin/bash
# SessionStart — make a fresh clone safe to commit from and able to run its tests.
#
# Two things bite a brand-new checkout of this repo, and both bit a real session
# on 18.9.2026:
#   1. The git identity is not the project's. A cloud clone defaults to
#      noreply@anthropic.com, so the work email never appears and the usual
#      "is the work email here?" check passes while the identity is still wrong.
#      Vercel refuses to build such a commit and stalls at UNKNOWN with no log.
#      See CLAUDE.md, "עיקרון ברזל — זהות הפרויקט".
#   2. node_modules is absent, so `npm test` dies with "vitest: not found".
set -euo pipefail

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# --- 1. Project identity — every environment, not just the web ---------------
# Local to this repo, so the machine's global identity is left untouched.
git -C "$ROOT" config --local user.email "ranzak@gmail.com"
git -C "$ROOT" config --local user.name  "Ran Zak"

# The check that counts is positive: absence of the work email is not proof.
identity="$(git -C "$ROOT" config user.email || true)"
if [ "$identity" != "ranzak@gmail.com" ]; then
  echo "SessionStart WARNING: git user.email is '${identity:-<unset>}', expected ranzak@gmail.com — do not commit." >&2
fi

# --- 2. Dependencies — remote sessions only ----------------------------------
# A local checkout manages its own node_modules; re-running install there would
# just be slow. `npm install` (not `ci`) so the cached container reuses the tree.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$ROOT"
npm install --no-audit --no-fund
