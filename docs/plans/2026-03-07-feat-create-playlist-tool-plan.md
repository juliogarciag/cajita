---
title: "Create Playlist Tool"
type: feat
status: active
date: 2026-03-07
---

# Create Playlist Tool

## Overview

Add a "Tools" section to cajita with a "Create Playlist" tool that lets users generate Apple Music playlists using Claude AI. The user writes a prompt, Claude suggests ~50 songs, the user curates the list (reload/delete songs), and then saves it as a playlist in their Apple Music library.

## Problem Statement / Motivation

The app currently only has login/logout. The goal is to turn cajita into a personal tools dashboard. The first tool adapts the CLI-based [agents-playground](https://github.com/juliogarciag/agents-playground) project into a web UI, making it accessible without a terminal.

## Proposed Solution

### High-Level Flow

1. User navigates to `/tools/create-playlist` (protected by auth)
2. Enters a text prompt describing the desired playlist
3. Clicks "Create Music Playlist"
4. If no Apple Music user token in localStorage (or expired), MusicKit JS OAuth popup opens
5. Server-side: Claude generates ~50 song suggestions → Apple Music catalog search resolves track IDs
6. Songs shown in a reviewable list (reload individual songs via Claude, delete songs)
7. User names the playlist (pre-filled from prompt), clicks "Save to Apple Music"
8. Playlist created in user's Apple Music library → success state with link

### Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Apple Music auth | MusicKit JS (browser) + server-signed developer JWT | Apple requires browser-side user auth; developer JWT needs .p8 private key (server-only) |
| User token storage | localStorage `{ token, storedAt }` | Simple, no DB needed for a 2-user app; token valid ~365 days |
| Claude API | Server-side via Anthropic SDK | API key must stay server-side |
| Song generation | Batch (not streaming) | Simpler implementation; ~50 songs + catalog search takes ~10-15s total |
| Catalog search | Parallel with concurrency limit (5) | Serial is too slow (50 sequential calls); unlimited parallel risks rate limiting |
| State management | React component state (ephemeral) | Song list is transient; losing it on refresh is acceptable for MVP |
| Authenticated layout | `_authenticated.tsx` layout route | Shared nav + single auth guard for `/dashboard` and `/tools/*` |
| Styling | Tailwind CSS (wire it up now) | The app needs real styling; inline styles won't scale |

## Technical Approach

### Phase 1: Foundation — Authenticated Layout + Navigation + Tailwind

**Goal:** Shared layout with top navigation for all authenticated pages.

**Tasks:**

- [ ] Wire up Tailwind CSS in `vite.config.ts` and add a global CSS import (`src/styles.css`)
- [ ] Create `src/routes/_authenticated.tsx` — layout route that runs `authMiddleware` in `beforeLoad` and renders a top nav bar + `<Outlet />`
- [ ] Move `/dashboard` under the authenticated layout: `src/routes/_authenticated/dashboard.tsx`
- [ ] Create `/tools` index route: `src/routes/_authenticated/tools/index.tsx` — lists available tools (just "Create Playlist" for now)
- [ ] Create placeholder: `src/routes/_authenticated/tools/create-playlist.tsx`
- [ ] Update `src/routes/index.tsx` (login page) to redirect to `/dashboard` if authed (keep existing behavior)
- [ ] Remove auth guard duplication from individual routes

**Files:**

| File | Action |
|---|---|
| `vite.config.ts` | Add `tailwindcss` plugin back |
| `src/styles.css` | Create — Tailwind directives |
| `src/routes/__root.tsx` | Import `styles.css` |
| `src/routes/_authenticated.tsx` | Create — layout with nav + auth guard |
| `src/routes/_authenticated/dashboard.tsx` | Move from `src/routes/dashboard.tsx` |
| `src/routes/_authenticated/tools/index.tsx` | Create — tools listing page |
| `src/routes/_authenticated/tools/create-playlist.tsx` | Create — placeholder |

#### Phase 1 verification
- Visit `/` → login page
- Login → redirected to `/dashboard` with top nav visible
- Top nav shows "Dashboard" and "Tools" links
- Click "Tools" → see tools index with "Create Playlist" card
- Click "Create Playlist" → see placeholder page with nav
- Visit `/tools/create-playlist` without session → redirect to `/`

---

### Phase 2: Apple Music Authentication

**Goal:** Users can authenticate with Apple Music via MusicKit JS; developer JWT is generated server-side.

**Tasks:**

- [ ] Add environment variables: `APPLE_TEAM_ID`, `APPLE_KEY_ID`
- [ ] Store `AuthKey_<KEY_ID>.p8` file — add path to `.env` as `APPLE_MUSIC_KEY_PATH` (or store the key content in `APPLE_MUSIC_PRIVATE_KEY` env var for Railway)
- [ ] Create `src/server/apple-music.ts` — function to generate Apple developer JWT (ES256, 6-hour expiry, caches in memory)
- [ ] Create server function `getDeveloperToken` in `src/server/apple-music.ts` — returns the signed JWT to the client (protected by auth middleware)
- [ ] Create `src/lib/apple-music-auth.ts` (client-side) — MusicKit JS initialization, `authorize()` wrapper, localStorage read/write for user token
- [ ] Define localStorage schema: key `cajita:apple_music` → `{ userToken: string, storedAt: number }`
- [ ] Token considered expired if `storedAt` is older than 180 days (conservative vs 365)
- [ ] Create `src/components/AppleMusicAuthButton.tsx` — button that triggers MusicKit auth on click (synchronous popup to avoid browser blocking)
- [ ] Load MusicKit JS script lazily only on the create-playlist route (not globally)
- [ ] Update `.env.example` with new Apple Music env vars

**Files:**

| File | Action |
|---|---|
| `src/server/apple-music.ts` | Create — developer JWT generation + server function |
| `src/lib/apple-music-auth.ts` | Create — client-side MusicKit wrapper + localStorage |
| `src/components/AppleMusicAuthButton.tsx` | Create — auth trigger button |
| `.env.example` | Add `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_MUSIC_PRIVATE_KEY` |
| `.env` | Add actual Apple Music values |
| `SETUP.md` | Add Apple Music developer setup instructions |

#### Phase 2 verification
- On create-playlist page, click "Connect Apple Music"
- MusicKit popup opens, user authorizes
- Token stored in localStorage under `cajita:apple_music`
- Refreshing page → token detected, no re-auth needed
- Clearing localStorage → auth required again

---

### Phase 3: Claude Song Generation

**Goal:** Server-side Claude integration that generates song recommendations from a prompt.

**Tasks:**

- [ ] Install `@anthropic-ai/sdk` and `zod`
- [ ] Add `ANTHROPIC_API_KEY` to env vars
- [ ] Create `src/server/claude.ts` — Claude client setup
- [ ] Create `src/server/playlist-generator.ts`:
  - `generateSongs(prompt, count)` — calls Claude with structured output, returns `Array<{ artist: string, title: string }>`
  - `generateReplacementSong(prompt, currentSongs, rejectedSong)` — generates one new song avoiding the rejected song's artist and all current songs
  - Zod schema: `z.object({ songs: z.array(z.object({ artist: z.string(), title: z.string() })) })`
  - System prompt includes: generate diverse songs matching the user's description, format as structured JSON, avoid duplicates
  - Temperature: 0.7
- [ ] Create server function `generatePlaylistSongs` — protected by auth middleware, accepts `{ prompt: string, count: number }`, returns song array
- [ ] Create server function `reloadSong` — protected by auth middleware, accepts `{ prompt, currentSongs, rejectedSong }`, returns one song
- [ ] Default song count: 50 (configurable in the prompt payload)

**Files:**

| File | Action |
|---|---|
| `src/server/claude.ts` | Create — Anthropic client |
| `src/server/playlist-generator.ts` | Create — song generation logic + server functions |
| `.env.example` | Add `ANTHROPIC_API_KEY` |

#### Phase 3 verification
- Call `generatePlaylistSongs` with a prompt → get ~50 song objects back
- Call `reloadSong` → get 1 song not in the current list
- Invalid/empty prompt → appropriate error

---

### Phase 4: Apple Music Catalog Search

**Goal:** Resolve Claude-generated songs to Apple Music track IDs.

**Tasks:**

- [ ] Create `src/server/apple-music-catalog.ts`:
  - `searchSong(artist, title, developerToken)` — searches Apple Music catalog, returns `{ id, name, artistName, artworkUrl, previewUrl } | null`
  - `searchSongs(songs[], developerToken)` — parallel search with concurrency limit of 5, returns results with match status
  - Region: `us` (hardcoded for MVP, document as limitation)
  - Handle: no match found → return `null` for that song
- [ ] Create server function `resolveSongs` — accepts song array + Apple user token, returns songs with Apple Music metadata
- [ ] Song data model after resolution:

```typescript
type ResolvedSong = {
  artist: string
  title: string
  appleMusicId: string | null  // null = not found
  artworkUrl: string | null
  previewUrl: string | null
  status: 'matched' | 'not_found'
}
```

**Files:**

| File | Action |
|---|---|
| `src/server/apple-music-catalog.ts` | Create — catalog search logic + server function |

#### Phase 4 verification
- Pass known songs → get Apple Music IDs + artwork
- Pass an obscure/fake song → get `status: 'not_found'`
- 50 songs resolve in <10 seconds (parallel)

---

### Phase 5: Create Playlist UI

**Goal:** Full UI for the create-playlist page with prompt input, song list, and playlist creation.

**Tasks:**

- [ ] Build out `src/routes/_authenticated/tools/create-playlist.tsx`:
  - **Initial state:** Textarea for prompt + "Create Music Playlist" button
  - **Loading state:** Progress indicator ("Generating songs...", "Searching Apple Music...")
  - **Song list state:** Grid/list of resolved songs with artwork, artist, title
    - Each song has: reload button (spinner while loading), delete button
    - Songs with `status: 'not_found'` shown with visual indicator + "Reload" encouraged
  - **Pre-creation state:** Editable playlist name field (pre-filled: first ~50 chars of prompt), "Save to Apple Music" button
  - **Success state:** Confirmation message + link to open Apple Music
  - **Error states:** Apple auth failed, Claude error, catalog search partial failure, playlist creation failed
- [ ] Create `src/components/SongCard.tsx` — individual song display with actions
- [ ] Create `src/components/PlaylistNameInput.tsx` — editable playlist name
- [ ] Create `src/server/apple-music-playlist.ts`:
  - `createPlaylist(name, trackIds, userToken, developerToken)` — POST to Apple Music API
  - Server function `savePlaylist` — protected by auth middleware

**Files:**

| File | Action |
|---|---|
| `src/routes/_authenticated/tools/create-playlist.tsx` | Build out full page |
| `src/components/SongCard.tsx` | Create — song display + actions |
| `src/components/PlaylistNameInput.tsx` | Create — editable name input |
| `src/server/apple-music-playlist.ts` | Create — playlist creation |

#### Phase 5 verification
- Full flow: prompt → auth → songs → review → create playlist
- Delete a song → removed from list
- Reload a song → replaced with new song from Claude
- Reload a "not found" song → replaced with a matched song
- Empty prompt → validation error
- All songs deleted → "Save" button disabled
- Playlist created → success message shown

---

## System-Wide Impact

### Interaction Graph

- User click "Create Music Playlist" → (if needed) MusicKit JS popup → `getDeveloperToken` server fn → `generatePlaylistSongs` server fn → Claude API → `resolveSongs` server fn → Apple Music Catalog API → render song list
- User click "Reload" on song → `reloadSong` server fn → Claude API → single catalog search → update list item
- User click "Save to Apple Music" → `savePlaylist` server fn → Apple Music Playlist API → success/error UI

### Error Propagation

- Claude API failure → server function throws → client shows error, preserves prompt
- Apple Music catalog 401 → developer JWT expired → regenerate and retry (transparent to user)
- Apple Music user token expired → client detects 401 from playlist creation → re-trigger MusicKit auth → retry
- Network failure → standard fetch error → show retry option

### State Lifecycle Risks

- Song list is ephemeral (React state only). Page refresh = list lost. Acceptable for MVP.
- Apple Music user token in localStorage survives page refresh but not browser data clear.
- Developer JWT is cached in server memory — restarting the server regenerates it (no persistence needed, it's short-lived).

### API Surface Parity

New server functions (all auth-protected):
- `getDeveloperToken` — returns Apple developer JWT
- `generatePlaylistSongs` — Claude song generation
- `reloadSong` — Claude single song replacement
- `resolveSongs` — Apple Music catalog search
- `savePlaylist` — Apple Music playlist creation

## Acceptance Criteria

### Functional

- [ ] Top navigation visible on all authenticated pages (Dashboard, Tools)
- [ ] `/tools` page lists available tools with "Create Playlist" as the first
- [ ] Create Playlist page has a textarea and submit button
- [ ] Apple Music auth works via MusicKit JS popup (token cached in localStorage)
- [ ] Claude generates ~50 song recommendations from the user's prompt
- [ ] Songs displayed with artwork (when available), artist name, and title
- [ ] User can delete individual songs from the list
- [ ] User can reload individual songs (Claude generates a replacement)
- [ ] Songs not found in Apple Music catalog are visually marked
- [ ] User can edit the playlist name before saving
- [ ] Playlist is created in the user's Apple Music library
- [ ] Success state shows confirmation after playlist creation
- [ ] All loading states have visual indicators
- [ ] Errors are shown with clear messages and retry options

### Non-Functional

- [ ] Claude API key and Apple .p8 key never exposed to client
- [ ] All server functions protected by auth middleware
- [ ] Catalog search completes in <15 seconds for 50 songs
- [ ] MusicKit JS loaded lazily (only on create-playlist route)

## Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Claude hallucinates non-existent songs | High | Medium | Show "not found" status, allow reload |
| Apple Music catalog search rate limiting (429) | Medium | High | Concurrency limit of 5, exponential backoff |
| MusicKit JS popup blocked by browser | Medium | High | Trigger popup synchronously in click handler, show fallback message |
| Apple developer token setup complexity | Low | Medium | Detailed instructions in SETUP.md |
| Region mismatch (US catalog vs user's storefront) | Low | Medium | Document limitation, hardcode `us` for MVP |

## New Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `APPLE_TEAM_ID` | Server | Apple developer team ID |
| `APPLE_KEY_ID` | Server | Apple Music key ID |
| `APPLE_MUSIC_PRIVATE_KEY` | Server | Contents of the .p8 private key (base64 or raw) |
| `ANTHROPIC_API_KEY` | Server | Claude API key |

## New Dependencies

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude API client |
| `zod` | Structured output schemas for Claude |
| `jose` | JWT signing for Apple developer token (ES256) |

## Sources & References

- [agents-playground reference project](https://github.com/juliogarciag/agents-playground) — original CLI implementation
- [Apple MusicKit JS documentation](https://developer.apple.com/documentation/musickitjs)
- [Apple Music API — Search](https://developer.apple.com/documentation/applemusicapi/search_for_catalog_resources)
- [Apple Music API — Create Playlist](https://developer.apple.com/documentation/applemusicapi/create_a_new_library_playlist)
- [Anthropic SDK — Structured Output](https://docs.anthropic.com/en/docs/build-with-claude/structured-output)
