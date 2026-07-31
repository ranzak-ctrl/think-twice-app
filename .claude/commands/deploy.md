---
description: "Deploy to Vercel via the CLI path, bypassing the broken Git integration, then verify the API actually works"
argument-hint: "[--skip-checks]"
allowed-tools: Bash(npx vercel:*), Bash(curl:*), Bash(npm run build:*), Bash(git log:*), Bash(git status:*), Read
---

Deploy production. The Git integration has been observed failing silently — production sat at an old commit marked `Ready Stale` while newer commits pushed to GitHub were never deployed — so the CLI path is the reliable route.

Unless `$ARGUMENTS` contains `--skip-checks`, run `/ship-check` first and stop if it reports BLOCKED.

## Steps

**1 · Authentication.** `npx vercel whoami`. If it fails, stop and ask Ran to run `npx vercel login` himself — it is interactive and browser-based, and you cannot complete it. Do not attempt a workaround.

**2 · Link.** `npx vercel link` to the existing `think-twice-app` project under the `Think Twice` team. Do not create a new project. The existing project id is in `.vercel/project.json`.

**3 · Deploy.** `npx vercel --prod`. Capture the full build log — this is the point of using the CLI, and the log is the evidence.

**4 · Read the log for the functions step.** Confirm `api/ping.js` and `api/anthropic/v1/messages.js` were compiled as serverless functions. If no functions step appears, stop and report it: this is the root cause of the 404s, and deploying again will not fix it. Check the project's Root Directory setting and whether new deployments are being created at all.

**5 · Verify.**
- `/api/ping` returns 200
- the proxy rejects a request with no `x-app-password`
- the proxy returns a real completion with the correct password
- the served asset hash differs from the previous deployment, proving new code is live

## Report

The deployment URL, the deployed commit, whether functions built, and each verification result. If anything failed, stop and report — never retry blindly. A deployment that looks successful but serves stale code is the exact failure this project already hit once.
