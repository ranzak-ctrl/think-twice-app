---
description: "Pre-deploy gate — verifies the build, the secrets boundary, and the live API path before anything ships to testers"
allowed-tools: Bash(npm test), Bash(npm run build:*), Bash(npx vitest run:*), Bash(curl:*), Bash(git log:*), Bash(git status:*), Read, Grep, Glob
---

Run every gate before a deployment reaches testers. Report each as PASS or FAIL with evidence. Do not deploy from this command — that is `/deploy`. This one only decides whether deploying is safe.

## Gates

**1 · Test suite green.** `npm test`. As of 18.9 that is 482 passing plus one skipped (the opt-in judge; `tests/live/` adds more skips once it exists). Read the number, not just the colour: a drop in count is as much a failure as a red test — it means tests stopped being collected. And remember what green does not cover — no test in the suite calls the model, so a clean run says nothing about how production behaves. That is gate 5's job.

**2 · Production build succeeds.** `npm run build`.

**3 · No API key in the bundle.** Grep `dist/` for `sk-ant`, for `ANTHROPIC_API_KEY`, and for any long base64-ish literal. The browser must call `/api/anthropic/v1/messages` with no key; the serverless function injects it. This gate is the one that must never be waived — a leaked key in a public bundle is unrecoverable.

**4 · Serverless functions actually built.** The known failure is that `api/` was never compiled into functions at all, which surfaced as every `/api/*` returning 404. Confirm all five of `api/ping.js`, `api/anthropic/v1/messages.js`, `api/report.js`, `api/interview-file.js` and `api/send-interview.js` exist, and that the last deployment log shows a functions build step. `api/interview-file.js` answers 500 `not-configured` until `INTERVIEW_FILE_KEYS` is set in Vercel — that is a blocking finding, not a warning: without it no person can save their interview at the end, and the end screen tells them the file failed.

**5 · Live endpoints respond, and one real interview turn runs.** `curl -s -o /dev/null -w "%{http_code}" https://think-twice-nine.vercel.app/api/ping` must return 200. Then the proxy with an `x-app-password` header — it must reject a wrong password and accept the right one. Ask Ran for the password rather than reading it from any env file.

`/api/ping` is not enough on its own and never has been: it never touches the model, so it returns 200 against a missing key, an exhausted account and a broken response shape alike. **The gate is one real turn in the browser.** The live interview went unverified from 14.8 through 18.9 while roughly fifty commits shipped — the whole illustration layer among them — precisely because ping was treated as proof.

From a cloud session this gate cannot run at all: the network policy refuses `vercel.app` with a 403 on CONNECT. Do not report it as passing or failing from there. Say it is unverifiable in this environment, hand Ran the commands, and clear what you can with gate 6 instead.

**6 · Build configuration, proven by the bundle fingerprint.** Three variables reach the browser, and all three are burned into the JS at build time rather than read at runtime:

| variable | what it decides |
|---|---|
| `VITE_USE_MOCK` | live model vs scripted mock |
| `VITE_REQUIRE_PASSWORD` | whether the password gate exists at all |
| `VITE_MODEL` | which model the app names |

Vite names the output file after a hash of its contents, so **the bundle filename is a fingerprint of the configuration that produced it.** That makes the deployment's configuration checkable without reaching the site:

```bash
# 1. the deployed name, from the Vercel build log (the `dist/assets/index-*.js` line)
# 2. the same commit, built here with the configuration production is supposed to have
env -u VITE_USE_MOCK -u VITE_MODEL VITE_REQUIRE_PASSWORD=1 npm run build
```

**Identical name → the gate passes**, and it passes for both halves at once: the password gate is on, and the app is live rather than mock, because a `VITE_USE_MOCK=true` build produces a different name. **A different name → stop.** Something in the Vercel environment is not what you think. Rebuild locally varying one variable at a time until you find which one accounts for the difference, and do not deploy until you know.

Two rules for using this:

- **Build, never compare against a remembered hash.** The fingerprint changes with every code change, so a value written down last week proves nothing. It is only meaningful against a build of the same commit.
- **Same commit both sides.** Comparing your working tree against a log line from an older deployment measures the code difference, not the configuration.

This gate works from a cloud session, where gate 5 cannot run at all. It is the only configuration check available there, and it replaces the old "look at the Vercel dashboard and trust it".

Do not check `VITE_LIVE` — it is a no-op since the `VITE_USE_MOCK` change and would pass or fail meaninglessly.

**7 · Deployed commit is current.** Compare the live commit against `git log -1`. Production has been silently stale before; treat any gap as a FAIL and name the missing commits.

**8 · Usage is being watched.** There is deliberately **no spend ceiling** (Ran, 18.9.2026). Do not report its absence as a failure and do not propose adding one as a fix — it is a decision, not an oversight.

The reasoning: a hard ceiling on a therapeutic interview tool does not degrade, it cuts. A tester severed at stage 3 is left with an opened wound and no closure, and testers work at hours nobody is watching. That clinical cost outweighs what the ceiling was guarding, given a closed group whose size and session count Ran controls directly.

What the ceiling actually guarded was never tester overspend — it was **blast radius if `APP_PASSWORD` spreads beyond the group**. The key itself is sound: server-side only, never in the bundle (gate 3), behind the password gate. So watch the thing that would signal it:

- Every proxy call now logs to Vercel Runtime Logs — `event: "ok"` per successful turn. Count them. A day's volume far above what the known testers could produce is the signal.
- The Anthropic console's usage view is the second source, and the one that shows cost.

**What reopens this question** — any of these, and a ceiling is back on the table:
- The link and password go beyond the controlled tester group, or to an open audience.
- Runtime Logs show volume the tester group cannot account for.
- The app stops being a closed prototype.

If the first happens, rotate `APP_PASSWORD` first; that is faster and more precise than a ceiling.

## Report

A gate table, then a single verdict: SAFE TO DEPLOY or BLOCKED. If blocked, the smallest set of fixes that clears it, in order.

Gate 3 is not waivable — a leaked key in a served bundle cannot be undone. (Gate 8 was unwaivable until 18.9, when the ceiling was deliberately dropped; it is now a monitoring gate and passes as long as someone is actually watching the volume.)

Any other gate may be knowingly accepted, but say explicitly that it is being accepted and what the exposure is. Gate 5 is the one most often skipped and least safe to skip: it is the only check that touches the model.
