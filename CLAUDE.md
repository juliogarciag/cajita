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

## Local HTTP/2 Setup (required for dev with many Electric shapes)

Browsers allow only 6 concurrent HTTP/1.1 connections per host. The app uses 7 Electric long-poll connections, which saturates the pool and causes navigation to stall. In production this is fine (Railway uses HTTP/2). Locally, run Caddy as a reverse proxy to get HTTP/2.

**One-time setup:**

```bash
brew install caddy
caddy trust  # installs Caddy's local CA into the macOS keychain (requires sudo prompt)
```

**Then just run:**

```bash
npm run dev
```

This starts both Vite (port 3000) and Caddy together. Access the app at **https://localhost:3000**. Vite runs internally on port 3001.

The `Caddyfile` at the project root configures this. No changes to the app code are needed — `window.location.origin` picks up the new origin automatically.
