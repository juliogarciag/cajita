# Cajita — Claude Code Guide

## Browser Preview Authentication

The app requires Google OAuth in production, but has a dev login shortcut for local testing.

**To authenticate in the preview browser** (required before interacting with any protected page):

```js
// In preview_eval:
window.location.href = '/api/auth/dev-login?isolated=true'
// Then wait for redirect to /dashboard
```

This creates an isolated user + team with no data — safe for testing without affecting real data. All ElectricSQL syncs are scoped to that team.

After authenticating, navigate to any route normally:
```js
window.location.href = '/finances/movements'
```

The same endpoint is used by e2e tests via `tests/e2e/fixtures.ts`.
