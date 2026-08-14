---
description: "Pre-deploy gate — verifies the build, the secrets boundary, and the live API path before anything ships to testers"
allowed-tools: Bash(npm test), Bash(npm run build:*), Bash(npx vitest run:*), Bash(curl:*), Bash(git log:*), Bash(git status:*), Read, Grep, Glob
---

Run every gate before a deployment reaches testers. Report each as PASS or FAIL with evidence. Do not deploy from this command — that is `/deploy`. This one only decides whether deploying is safe.

## Gates

**1 · Test suite green.** `npm test`. The expected count is ~323 plus one skipped (the opt-in judge). A drop in count is as much a failure as a red test — it means tests stopped being collected.

**2 · Production build succeeds.** `npm run build`.

**3 · No API key in the bundle.** Grep `dist/` for `sk-ant`, for `ANTHROPIC_API_KEY`, and for any long base64-ish literal. The browser must call `/api/anthropic/v1/messages` with no key; the serverless function injects it. This gate is the one that must never be waived — a leaked key in a public bundle is unrecoverable.

**4 · Serverless functions actually built.** The known failure is that `api/` was never compiled into functions at all, which surfaced as every `/api/*` returning 404. Confirm both `api/ping.js` and `api/anthropic/v1/messages.js` exist and that the last deployment log shows a functions build step.

**5 · Live endpoints respond.** `curl -s -o /dev/null -w "%{http_code}" https://think-twice-nine.vercel.app/api/ping` must return 200. Then the proxy with an `x-app-password` header — it must reject a wrong password and accept the right one. Ask Ran for the password rather than reading it from any env file.

**6 · Password gate active.** `VITE_REQUIRE_PASSWORD=1` set in the Vercel environment, and `PasswordGate` present in the served app. Do not check `VITE_LIVE` — it is a no-op since the `VITE_USE_MOCK` change and would pass or fail meaninglessly. What matters is that `VITE_USE_MOCK` is **not** set to `true` in Vercel.

**7 · Deployed commit is current.** Compare the live commit against `git log -1`. Production has been silently stale before; treat any gap as a FAIL and name the missing commits.

**8 · Spend ceiling in place.** Confirm the deployed `ANTHROPIC_API_KEY` is a dedicated key with a spending limit, not a general-purpose one. Testers running full interviews against an uncapped key is an open, known risk (DEPLOY-STATUS).

## Report

A gate table, then a single verdict: SAFE TO DEPLOY or BLOCKED. If blocked, the smallest set of fixes that clears it, in order.

Gate 3 and gate 8 are not waivable. Any other gate may be knowingly accepted, but say explicitly that it is being accepted and what the exposure is.
