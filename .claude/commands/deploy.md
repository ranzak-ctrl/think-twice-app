---
description: "Deploy to Vercel via the CLI path, bypassing the broken Git integration, then verify the API actually works"
argument-hint: "[--skip-checks]"
allowed-tools: Bash(npx vercel:*), Bash(curl:*), Bash(npm run build:*), Bash(npm version:*), Bash(git log:*), Bash(git status:*), Bash(git config:*), Bash(git add:*), Bash(git commit:*), Bash(git tag:*), Bash(git push:*), Read
---

Deploy production. The Git integration has been observed failing silently — production sat at an old commit marked `Ready Stale` while newer commits pushed to GitHub were never deployed — so the CLI path is the reliable route.

Unless `$ARGUMENTS` contains `--skip-checks`, run `/ship-check` first and stop if it reports BLOCKED.

## Steps

**0 · Raise the app version — every push to QA and every release to testers** (Ran's rulings, 9.10.2026 and 24.10.2026: "a number on every version, so we can roll back"). The version heads every session export and error report, and shows on the password gate and in the guide panel's title, so a tester's file and the screen say which build they came from; a build that keeps the old number makes two different builds indistinguishable, and a rollback has nothing to name.
- **Every push to the QA branch** ends with the `release: vX.Y.Z` commit, so the deployment list in Vercel reads a version per deployment. Not only production releases. **The release commit is the anchor**, not the tag: a cloud session may push only its own branch, and `git push origin vX.Y.Z` is refused with 403 (seen 24.10.2026, v1.1.0). Create the tag anyway and push it when the credentials allow (a local session, Ran's Mac); when they do not, say so once and move on. `git log --grep "release: vX.Y.Z"` finds the anchor without it.
- **Rollback** (Ran asks "חזור ל-vX.Y.Z"): never rewrite history. On the branch: `git checkout vX.Y.Z -- .` (the tag's whole tree, over the working copy; without the tag, the sha of the `release: vX.Y.Z` commit), then raise the version again, commit as `release: vA.B.C (rollback to vX.Y.Z)`, tag, push. The old version comes back under a new number, and the history still shows what happened. Vercel's own Redeploy of the deployment named `release: vX.Y.Z` is the same content without the record, and is Ran's to click.
- Pick the bump: **patch** (1.1.0 → 1.1.1) when the release only fixes things; **minor** (1.1.0 → 1.2.0) when a tester will notice something — interview wording or behaviour, a new screen, a new interview model. Never major without Ran.
- Identity first, positively: `git config user.email` must print `ranzak@gmail.com` (CLAUDE.md, iron rule — on Ran's Mac the global identity is the work address, and Vercel blocks a commit by an unrecognised author with no error at all).
- `npm version <patch|minor> --no-git-tag-version` (updates package.json and package-lock.json), then commit them alone as `release: vX.Y.Z`, tag `vX.Y.Z`, and push the branch and the tag.
- These steps are why the command may run `npm version` and `git config` / `add` / `commit` / `tag` / `push` (its `allowed-tools`). Ran confirmed that permission himself on 9.10.2026 — it covers this version step and nothing else.
- Deploy **that** commit. The version is burned into the bundle at build time, so it changes the bundle's name: `/ship-check` gate 6 must compare the deployed name with a local build of this same commit, after the bump — never with a build from before it.

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

The released version (`vX.Y.Z` — tell Ran; it is what heads every export from this release), the deployment URL, the deployed commit, whether functions built, and each verification result. If anything failed, stop and report — never retry blindly. A deployment that looks successful but serves stale code is the exact failure this project already hit once.
