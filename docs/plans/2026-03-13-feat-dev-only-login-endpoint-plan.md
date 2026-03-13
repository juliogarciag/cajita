---
title: "feat: Add dev-only login endpoint for local development"
type: feat
status: completed
date: 2026-03-13
---

# feat: Add dev-only login endpoint for local development

## Overview

Create a `GET /api/auth/dev-login` endpoint that authenticates a dev user without going through Google OAuth. This enables headless tools like Claude Preview to access authenticated routes during local development.

## Problem Statement / Motivation

The app requires Google OAuth to access any `/finances/*` route. The Claude Preview tool runs a headless browser that cannot complete Google's OAuth flow (bot detection, CAPTCHA, no interactive UI). This blocks preview-driven development for all authenticated features.

A dev-only login endpoint creates a real session via the existing `upsertUser()` + `createSession()` infrastructure, skipping only the Google OAuth dance. The session is indistinguishable from a real one — same cookie, same database row, same 7-day expiry.

## Proposed Solution

A single new file: `src/routes/api/auth/dev-login.ts`

**Behavior:**

1. Guard: if `NODE_ENV !== 'development'`, return `404` (not 403 — reveals nothing about the endpoint's existence)
2. Call `upsertUser({ email, name, picture })` using the first email from the existing allowlist (`julioggonz@gmail.com`)
3. Call `createSession(userId)` to get a session token
4. Set the `session` cookie via `serializeCookie()` (same options as OAuth callback)
5. Log: `[dev-login] Session created for <email>`
6. Redirect `302` to `/dashboard`

**Key design decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Guard condition | `=== 'development'` | Stricter than `!== 'production'` — excludes staging, preview, test, undefined |
| Production response | 404 | Indistinguishable from nonexistent route |
| Dev user email | First allowlist email | Real user, no fake data, consistent with app's actual data |
| HTTP method | GET | Preview tool authenticates by navigating to a URL |
| Session expiry | 7 days (default) | Reuses `createSession()` as-is, no special dev logic |
| Redirect target | Always `/dashboard` | No configurable redirect (avoids open redirect risk) |
| Existing session cleanup | None | Matches OAuth behavior — old sessions expire naturally |

## Technical Considerations

- **Security**: The `=== 'development'` guard is a single runtime check. This is acceptable for a personal app with 2 users. Defense in depth (build-time exclusion, localhost-only binding) is unnecessary here.
- **First dev-only code path**: This is the first `NODE_ENV` check in the codebase beyond the cookie `secure` flag. A `console.log` at startup when the route is active would help discoverability.
- **No allowlist bypass**: The dev user's email is already in the allowlist, so no allowlist logic needs to change.
- **Session accumulation**: Each dev-login creates a new session row. These expire after 7 days. Not a concern for a 2-user app.

## Acceptance Criteria

- [x] `GET /api/auth/dev-login` in development creates a session and redirects to `/dashboard`
- [x] `GET /api/auth/dev-login` in production returns 404 with no body
- [x] After hitting the endpoint, the browser has a valid `session` cookie
- [x] Authenticated routes (`/finances/*`) work after dev-login
- [x] Console logs the dev-login event
- [x] TypeScript compiles cleanly (`npx tsc --noEmit`)

## MVP

### `src/routes/api/auth/dev-login.ts`

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { upsertUser, createSession } from '#/server/session.js'
import { serializeCookie } from '#/server/cookies.js'
import { ALLOWED_EMAILS } from '#/config/allowed-users.js'

export const Route = createFileRoute('/api/auth/dev-login')({
  server: {
    handlers: {
      GET: async () => {
        if (process.env.NODE_ENV !== 'development') {
          return new Response(null, { status: 404 })
        }

        const email = ALLOWED_EMAILS[0]
        const userId = await upsertUser({
          email,
          name: 'Dev User',
          picture: '',
        })

        const token = await createSession(userId)

        console.log(`[dev-login] Session created for ${email}`)

        return new Response(null, {
          status: 302,
          headers: {
            Location: '/dashboard',
            'Set-Cookie': serializeCookie('session', token, {
              httpOnly: true,
              sameSite: 'lax',
              maxAge: 60 * 60 * 24 * 7,
              path: '/',
            }),
          },
        })
      },
    },
  },
})
```

## Dependencies & Risks

- **Dependencies**: None — all infrastructure (`upsertUser`, `createSession`, `serializeCookie`) already exists
- **Risk**: Accidentally deploying with `NODE_ENV=development` on a public server. Mitigated by: (a) this is a personal app, (b) hosting platforms default to `NODE_ENV=production`, (c) 404 response in non-development environments

## Sources & References

- Existing OAuth callback pattern: `src/routes/api/auth/callback.ts`
- Session management: `src/server/session.ts`
- Cookie utilities: `src/server/cookies.ts`
- Allowed users config: `src/config/allowed-users.ts`
