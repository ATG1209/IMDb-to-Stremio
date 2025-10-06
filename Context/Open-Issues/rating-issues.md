# Rating Display Issues - Investigation Document

**Status**: DIAGNOSED – CODE UPDATE REQUIRED
**Version**: 3.7.1
**Branch**: feature/imdb-ratings (dashboard still uses legacy sync cache)
**Created**: 2025-10-06
**Last Reviewed**: 2025-10-07
**Reporter**: User feedback via screenshots

## Problem Summary

Despite multiple fixes to TypeScript interfaces and UI components, IMDb ratings are not displaying in the web app dashboard. The UI shows "No rating" below movie posters, even though the API endpoints are confirmed to return valid rating data.

**Key finding (2025-10-07)**: the dashboard never touches the enriched data coming from `fetch-watchlist.ts`/VPS worker. Instead, `/api/watchlist` hydrates the UI from the legacy cache file `data/watchlist-cache.json` that is created by `lib/imdb-sync.ts`. That sync service still saves items without `imdbRating`, so the UI faithfully renders `undefined` values as "No rating".

### Symptoms

1. **Initial Load**: Briefly shows "No rating" for ~1 second
2. **After Load**: Sometimes switches to showing movie titles instead of ratings
3. **Expected Behavior**: Should show rating badge (e.g., "⭐ 8.4") below each poster
4. **Actual Behavior**: Shows "No rating" text or movie title

## Timeline of Fixes Attempted

### Fix #1: Update Data Pipeline (v3.6.0)
**File**: `lib/fetch-watchlist.ts:511-542`

Changed from fetching only posters to fetching complete metadata including ratings:

```typescript
// OLD - Only fetched posters
const tmdbPosters = await getTMDBPosterBatch(...)

// NEW - Fetches complete metadata including ratings
const tmdbMetadata = await getTMDBMetadataBatch(
  allItems.map(item => ({ title: item.title, year: item.year }))
);

// Apply TMDB data to all items
allItems.forEach(item => {
  const key = `${item.title.toLowerCase()}-${item.year || 'unknown'}`;
  const metadata = tmdbMetadata.get(key);
  if (metadata) {
    if (metadata.imdbRating) item.imdbRating = metadata.imdbRating;
    if (metadata.numRatings) item.numRatings = metadata.numRatings;
    if (metadata.runtime) item.runtime = metadata.runtime;
    if (metadata.popularity) item.popularity = metadata.popularity;
  }
});
```

**Result**: API confirmed returning ratings (e.g., The Pianist: 8.38), but UI still showed "No rating"

---

### Fix #2: Update UI Components to Show Rating Only
**Files**:
- `components/CatalogPreview.jsx:253-269`
- `pages/dashboard.jsx:436-453`
- `pages/dashboard/[userId].jsx:465-520`

Replaced title display with rating-only badges:

```jsx
// dashboard.jsx - Show ONLY rating, no title
<div className="flex-1 min-w-0 flex items-center justify-center">
  {item.imdbRating && item.imdbRating > 0 ? (
    <a
      href={`https://www.imdb.com/title/${item.imdbId}/`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 rounded-lg transition-colors shadow-md"
    >
      <span className="text-base">⭐</span>
      <span className="text-sm font-bold text-gray-900">
        {item.imdbRating.toFixed(1)}
      </span>
    </a>
  ) : (
    <span className="text-sm text-gray-400 dark:text-gray-500">No rating</span>
  )}
</div>
```

**Result**: Still showing "No rating" - data not reaching UI components

---

### Fix #3: Add Missing TypeScript Interface Fields (/api/watchlist)
**File**: `pages/api/watchlist.ts:5-19`

Added missing rating fields to `WatchlistItem` interface:

```typescript
interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  imdbRating?: number;   // ADDED
  numRatings?: number;   // ADDED
  runtime?: number;      // ADDED
  popularity?: number;   // ADDED
  userRating?: number;   // ADDED
  addedAt: string;
}
```

**Result**: Still showing "No rating" - TypeScript was stripping the field

---

### Fix #4: Add Missing TypeScript Interface Fields (/api/imdb-watchlist)
**File**: `pages/api/imdb-watchlist.ts:6-21`

Fixed SECOND interface with same missing fields:

```typescript
interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  rating?: string;       // Existing field
  imdbRating?: number;   // ADDED - Critical for rating display
  numRatings?: number;   // ADDED
  runtime?: number;      // ADDED
  popularity?: number;   // ADDED
  userRating?: number;   // ADDED
  addedAt: string;
}
```

**Result**: Dev server rebuilt successfully, but ratings STILL not showing

---

## Data Flow Architecture

```
IMDb Scraping (Playwright)
  ↓
lib/fetch-watchlist.ts
  ↓
TMDB API (getTMDBMetadataBatch)
  ↓
pages/api/imdb-watchlist.ts (WatchlistItem interface)
  ↓
pages/api/watchlist.ts (WatchlistItem interface)
  ↓
React Components:
  - pages/dashboard.jsx
  - pages/dashboard/[userId].jsx
  - components/CatalogPreview.jsx
```

## Verified Working Components

### ✅ API Endpoints Returning Ratings

**Test URL**: `http://localhost:3000/api/imdb-watchlist?userId=ur31595220`

**Confirmed Response**:
```json
{
  "items": [
    {
      "imdbId": "tt0253474",
      "title": "The Pianist",
      "imdbRating": 8.38,
      "numRatings": 912345,
      ...
    }
  ]
}
```

### ✅ Stremio Addon Metadata

**File**: `pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts:119-133`

Successfully adds ratings to Stremio metadata:

```typescript
if (item.imdbRating && item.imdbRating > 0) {
  meta.description = `⭐ ${item.imdbRating.toFixed(1)}/10 IMDb\n\n${meta.description}`;
  meta.imdbRating = item.imdbRating.toFixed(1);
}

meta.links = [
  {
    name: 'IMDb',
    category: 'imdb',
    url: `https://www.imdb.com/title/${item.imdbId}/`
  }
];
```

**Result**: Stremio addon correctly displays ratings

### ✅ TMDB Integration

**File**: `lib/fetch-watchlist.ts:511-542`

TMDB batch processing confirmed working:
- Fetches ratings via `vote_average` field
- Maps ratings to items by title-year key
- Adds `imdbRating`, `numRatings`, `runtime`, `popularity` to items

## Confirmed Failure Point

- `/api/watchlist` is the only endpoint the dashboard hits during initial load (see `pages/dashboard.jsx` → `loadWatchlist`).
- That endpoint reads `data/watchlist-cache.json` via `pages/api/watchlist.ts` without touching the enriched data path.
- `lib/imdb-sync.ts` writes the cache file after the Playwright sync, but its `WatchlistItem` omits every rating-related field, so the persisted objects look like:

```json
{
  "imdbId": "tt0253474",
  "title": "The Pianist",
  "type": "movie",
  "addedAt": "2025-10-07T03:58:21.123Z"
}
```

- Each dashboard render therefore receives `imdbRating === undefined` and the badge falls back to "No rating". The worker/TMDB pipeline never enters this request path.

### Evidence: Legacy Sync Writer

```typescript
// lib/imdb-sync.ts:6-54 (trimmed)
interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  addedAt: string;
}

const cache: WatchlistCache = {
  items,
  lastUpdated: new Date().toISOString(),
  totalItems: items.length
};
await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
```

### Why Previous Fixes Missed This

- All fixes targeted the worker/TMDB pipeline and React components, which *do* produce ratings.
- The dashboard, however, never calls `/api/imdb-watchlist`; it stops at `/api/watchlist`, so those fixes could not surface in the UI.
- Any sync run (manual or VPS) overwrites the cache with rating-less payloads, reintroducing the bug immediately after each deploy.

## Resolution Plan

1. **Unify the data source** for both the dashboard and the Stremio addon.
   - Preferred: have the sync job reuse `fetchWatchlist(userId, { forceRefresh: true })` (or the VPS worker client) and persist the enriched objects.
   - Alternative: point the dashboard directly at `/api/imdb-watchlist` and stop writing the legacy cache file.
2. **Update type definitions** so `lib/imdb-sync.ts` exports the same `WatchlistItem` shape as `lib/fetch-watchlist.ts` / worker responses.
3. **Invalidate stale cache files** once the new code ships (`rm data/watchlist-cache.json` in deployments and VPS worker cache flush).

### Implementation Sketch (preferred path)

```typescript
// lib/imdb-sync.ts
import { fetchWatchlist } from './fetch-watchlist';
import { ensureContentTypesWithTMDB } from './tmdb';
import type { WatchlistItem } from './fetch-watchlist';

async syncWatchlist(): Promise<WatchlistCache> {
  const userId = await this.resolveUserId(); // already derived during scraping/login
  const freshItems = await fetchWatchlist(userId, { forceRefresh: true });
  await ensureContentTypesWithTMDB(freshItems, '[Sync Job] TMDB refresh');

  const cache: WatchlistCache = {
    items: freshItems,
    lastUpdated: new Date().toISOString(),
    totalItems: freshItems.length
  };
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
  return cache;
}
```

### Verification Checklist

- [ ] `npm run sync` writes `data/watchlist-cache.json` entries containing `imdbRating`, `numRatings`, and `runtime`.
- [ ] `/api/watchlist` response shows the rating fields.
- [ ] Dashboard renders `⭐ 8.x` badges without hard refresh tricks.
- [ ] Regression: confirm Stremio addon still reads ratings (it already uses the enriched path).

### Open Questions / Follow-ups

- Does the Playwright sync still need to scrape once `fetchWatchlist` handles the heavy lifting? We could remove the custom scraper in favour of the worker entirely.
- If we keep Playwright for authentication, ensure we persist the resolved IMDb user id so we can call `fetchWatchlist` without duplicating scraping logic.
- Update deployment runbooks to wipe the stale cache file when deploying this fix.

## Files Modified

| File | Purpose | Status |
|------|---------|--------|
| `lib/version.ts` | Version bump to 3.7.1 | ✅ Updated |
| `lib/fetch-watchlist.ts` | TMDB metadata integration | ✅ Updated |
| `pages/api/imdb-watchlist.ts` | WatchlistItem interface | ✅ Fixed |
| `pages/api/watchlist.ts` | WatchlistItem interface | ✅ Fixed |
| `pages/dashboard.jsx` | Rating badge display | ✅ Updated |
| `pages/dashboard/[userId].jsx` | Rating badge + sync time | ✅ Updated |
| `components/CatalogPreview.jsx` | Rating badge overlay | ✅ Updated |
| `pages/api/stremio/.../catalog/.../[catalogId].ts` | Stremio metadata | ✅ Working |
| `lib/imdb-sync.ts` | Sync cache writer lacks rating fields | ❌ Pending |

## Next Actions

1. Refactor `lib/imdb-sync.ts` to persist the enriched `WatchlistItem` shape (see plan above).
2. Decide whether the dashboard should hit `/api/imdb-watchlist` directly or continue reading the cache file once it contains ratings.
3. Remove existing `data/watchlist-cache.json` artifacts in all environments after deploying the fix.
4. Update ops docs/deployment scripts to ensure the cache only ever contains enriched data going forward.

## Related Documentation

- **Architecture**: `/Context/Ultimate-Workflow-Fix.md`
- **TMDB Integration**: `lib/tmdb.ts`
- **Watchlist Scraping**: `lib/fetch-watchlist.ts`
- **Legacy Sync Service**: `lib/imdb-sync.ts`
- **Version History**: See git log on `feature/imdb-ratings` branch

---

**Last Updated**: 2025-10-07
**Version**: 3.7.1
**Developer Notes**: Ratings disappear because the dashboard only consumes the legacy `watchlist-cache.json` written by `lib/imdb-sync.ts`. Implement the resolution plan above so the cache (or the UI endpoint) uses the enriched data that already contains `imdbRating`.
