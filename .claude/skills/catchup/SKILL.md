---
name: catchup
description: Update dependencies and show a summary of what changed. Use when returning to the project after some time away.
---

You are helping the user catch up on this project after time away. Update dependencies and summarize what changed.

## STEP 1: CAPTURE CURRENT STATE

Run `npm outdated` to see what's currently outdated before updating. Save this output — you'll need it for the summary.

## STEP 2: UPDATE DEPENDENCIES

Run `npm update` to update all dependencies within their semver ranges.

## STEP 3: CHECK FOR MAJOR UPDATES

Run `npm outdated` again. If any packages still show as outdated (meaning there are major version bumps available beyond the semver range), list them separately as available major upgrades but do NOT install them automatically.

## STEP 4: SUMMARIZE

Present a clear summary with:

**Updated** (packages that were actually updated by `npm update`):
- package: old version -> new version

**Major upgrades available** (requires manual version bump in package.json):
- package: current -> latest (note any breaking changes if known)

**No changes:**
- If nothing was outdated, just say "All dependencies are up to date."

## STEP 5: HEALTH CHECK

Run a quick build and typecheck to make sure the project still compiles:

1. Run `npx tsc --noEmit` to check for type errors.
2. Run `npm run build` to verify the project builds.

Report the result:
- If both pass: "Project builds and typechecks cleanly."
- If either fails: show the relevant errors so the user can fix them before diving in.

## STEP 6: GIT CHANGES

If `package-lock.json` changed, mention it so the user can decide whether to commit.

## RULES

- Only run `npm update`, never `npm install <package>@latest` — respect semver ranges.
- Do not modify `package.json` — only `npm update` (which updates the lockfile).
- If `npm update` fails, report the error and continue with the summary.
- Keep the summary concise — group minor patch updates if there are many.
