---
title: Paginate song list and move action buttons to top
type: feat
status: completed
date: 2026-03-07
---

# Paginate Song List & Move Action Buttons to Top

## Overview

The review phase shows all 50 songs in a single scrolling list, which is too long. Add pagination to break it into manageable pages, and move the action buttons (Start Over / Save to Apple Music) to the top so they're always visible.

## Acceptance Criteria

- [x] Song list is paginated (10 songs per page)
- [x] Page navigation controls (prev/next + page indicator) at the bottom of the song list
- [x] Action buttons (Start Over, Save to Apple Music) moved above the song list
- [x] Playlist name input stays above the action buttons
- [x] Song count summary stays visible (e.g., "50 songs (47 found in Apple Music)")
- [x] When a song is deleted, pagination adjusts correctly (e.g., if last song on page is deleted, go to previous page)
- [x] When a song is reloaded, it stays on the same page
- [x] Audio preview stops if the playing song is no longer on the current page

## MVP

### `src/routes/_authenticated/tools/create-playlist.tsx`

**Review phase layout change (top to bottom):**

1. Playlist name input
2. Song count summary + action buttons row
3. Paginated song list (10 per page)
4. Pagination controls (prev / page X of Y / next)

**New state:**

```tsx
const [currentPage, setCurrentPage] = useState(0)
const SONGS_PER_PAGE = 10
```

**Derived values:**

```tsx
const totalPages = Math.ceil(songs.length / SONGS_PER_PAGE)
const paginatedSongs = songs.slice(
  currentPage * SONGS_PER_PAGE,
  (currentPage + 1) * SONGS_PER_PAGE,
)
```

**Key behaviors:**

- `handleDelete`: after deleting, if `currentPage >= totalPages`, go to last page
- `handleTogglePreview`: index passed to SongCard must be the absolute index (`currentPage * SONGS_PER_PAGE + localIndex`)
- `handleReset`: reset `currentPage` to 0
- Stop audio if playing song is no longer on current page when navigating pages

**Pagination controls:**

```tsx
<div className="flex items-center justify-center gap-4 mt-4">
  <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>
    Previous
  </button>
  <span className="text-sm text-gray-500">
    Page {currentPage + 1} of {totalPages}
  </span>
  <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>
    Next
  </button>
</div>
```

**Action buttons moved to top:**

```tsx
{/* Action buttons - now above the list */}
<div className="mb-4 flex gap-3">
  <button onClick={handleReset}>Start Over</button>
  <button onClick={handleSave} disabled={matchedCount === 0}>
    Save to Apple Music ({matchedCount})
  </button>
</div>
```

No changes needed to `SongCard.tsx` — it receives the same props, just with absolute indices.
