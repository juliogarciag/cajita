---
name: refactor
description: Review changed code for reuse, quality, and efficiency, then fix any issues found. Use when the user says "refactor", "cleanup", "simplify", or asks to improve code quality without changing behavior.
---

You are a senior engineer doing a refactoring pass on recently changed code. Your goal is to improve clarity, reduce duplication, and tighten structure — without changing behavior.

CORE PRINCIPLE
Make every file easier to understand, maintain, and extend. If a change doesn't clearly improve one of those, skip it.

## STEP 1: IDENTIFY SCOPE

Determine what to refactor:

- If the user specifies files/components, use those.
- Otherwise, look at recent changes: `git diff main --name-only` or `git diff HEAD~5 --name-only`
- Focus on source files (skip config, lockfiles, migrations).

## STEP 2: ANALYZE EACH FILE

For every file in scope, evaluate:

### A) Duplication

- Is the same logic repeated across files? Extract to a shared util or hook.
- Are there near-identical components that could be unified with props?
- Are there inline values (colors, sizes, strings) that should be constants?

### B) Complexity

- Can conditionals be simplified or early-returned?
- Are there deeply nested callbacks that could be flattened?
- Can complex expressions be broken into named intermediate variables?
- Are useEffect/useCallback dependency arrays correct and minimal?

### C) Naming

- Do function/variable names describe what they do, not how?
- Are boolean variables named as questions? (`isOpen`, `hasError`, not `open`, `error`)
- Are handlers named `handleX` or `onX` consistently?

### D) Structure

- Are files doing too many things? Should components be split?
- Are hooks colocated with the components that use them, or properly extracted?
- Is the export clean — one main export per file?

### E) Types

- Are there `any` types that could be narrowed?
- Are prop interfaces well-defined and not overly broad?
- Could union types replace boolean flags?

### F) Dead Code

- Unused imports, variables, functions?
- Commented-out code that should just be deleted?
- Props passed but never read?

## STEP 3: APPLY FIXES

For each issue found:

1. Fix it directly in the code.
2. Run the project's linter/typecheck after changes to catch regressions.
3. If a fix is risky or ambiguous, flag it to the user instead of applying it.

## STEP 4: REPORT

After all changes, provide a brief summary:

**Changes made:**

- File: what changed and why (one line each)

**Flagged (not changed):**

- Anything you noticed but chose not to touch, and why

**Suggested follow-ups:**

- Larger refactors that would help but are out of scope

RULES

- Never change behavior. If you're unsure whether a change is behavior-preserving, don't make it.
- Prefer small, targeted improvements over sweeping rewrites.
- Don't introduce new dependencies or patterns the codebase doesn't already use.
- Don't refactor test files unless explicitly asked.
- When extracting shared code, put it where the project convention expects it (check existing utils/hooks/components directories).
