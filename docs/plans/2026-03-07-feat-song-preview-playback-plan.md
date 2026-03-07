---
title: "feat: Add song preview playback to playlist song list"
type: feat
status: active
date: 2026-03-07
---

# feat: Add song preview playback to playlist song list

## Overview

Add a play/pause button to each song card in the Create Playlist review phase. Clicking it plays the Apple Music ~30-second preview clip. Only one song plays at a time — clicking a different song stops the previous one.

## Context

The data layer is already complete:

- `CatalogSong` has a `previewUrl: string | null` field (`src/server/apple-music-catalog.ts:14`)
- The catalog search already extracts `previews[0].url` from Apple Music API responses (`src/server/apple-music-catalog.ts:129,140`)
- Preview URLs are standard MP3/M4A files served from Apple's CDN — playable with a plain `<audio>` element

## Proposed Solution

Use a single shared `HTMLAudioElement` managed at the page level (in `create-playlist.tsx`) and pass play/stop callbacks down to `SongCard`. This avoids creating 50 separate `<audio>` elements and ensures only one song plays at a time.

### State model

```
currentlyPlayingIndex: number | null
```

- `null` = nothing playing
- When user clicks play on song `i`: if `i === currentlyPlayingIndex`, pause and set to `null`. Otherwise, switch the audio `src` and play.
- When audio ends naturally, set back to `null`.

### Files to change

| File | Change |
|------|--------|
| `src/routes/_authenticated/tools/create-playlist.tsx` | Add `useRef<HTMLAudioElement>` + `currentlyPlayingIndex` state. Create `handleTogglePreview(index)` callback. Pass `isPlaying` and `onTogglePreview` props to `SongCard`. |
| `src/components/SongCard.tsx` | Add new props: `isPlaying: boolean`, `onTogglePreview: () => void`. Show a play/pause icon button (lucide-react `Play` / `Pause` icons). Disable for `not_found` songs or songs without `previewUrl`. |

## Acceptance Criteria

- [ ] Each matched song with a `previewUrl` shows a play/pause button
- [ ] Clicking play starts the ~30s preview; the button switches to pause
- [ ] Clicking pause stops playback
- [ ] Clicking play on a different song stops the previous one and starts the new one
- [ ] Songs without `previewUrl` (or `not_found` status) show no play button (or a disabled one)
- [ ] When the preview finishes naturally, the button reverts to play
- [ ] No visible `<audio>` element — purely controlled via JS

## Sources

- `src/server/apple-music-catalog.ts:9-16` — `CatalogSong` interface with `previewUrl`
- `src/components/SongCard.tsx` — current song card component
- `src/routes/_authenticated/tools/create-playlist.tsx` — page managing the songs list
