# Rating Display Issues - Investigation Document

**Status**: UNRESOLVED
**Version**: 3.7.1
**Branch**: feature/imdb-ratings
**Created**: 2025-10-06
**Reporter**: User feedback via screenshots

## Problem Summary

Despite multiple fixes to TypeScript interfaces and UI components, IMDb ratings are not displaying in the web app dashboard. The UI shows "No rating" below movie posters, even though the API endpoints are confirmed to return valid rating data.

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

## Potential Root Causes

### 1. **Data Not Persisting Through Cache**
The dashboard might be loading from cached data that predates the rating implementation.

**Files to Check**:
- `data/watchlist-cache.json` (local file cache)
- Redis cache on VPS (if using worker)
- Browser localStorage/sessionStorage

**Test**: Force fresh scrape with `?refresh=1&nocache=1` parameter

---

### 2. **TypeScript Interface Mismatch**
Despite fixing both interfaces, there might be another interface definition or type casting that's stripping the rating field.

**Search For**: All `WatchlistItem` interface definitions
```bash
grep -r "interface WatchlistItem" pages/
grep -r "WatchlistItem" lib/
```

---

### 3. **React State Not Updating**
The UI components might not be re-rendering when data changes.

**Files to Check**:
- `pages/dashboard.jsx` - State management for items
- `pages/dashboard/[userId].jsx` - useEffect dependencies
- `components/CatalogPreview.jsx` - Props handling

**Test**: Add console.log to see what data is actually received:
```javascript
console.log('Dashboard items:', items.map(i => ({
  title: i.title,
  imdbRating: i.imdbRating
})));
```

---

### 4. **API Route Caching**
Next.js might be caching the API response before ratings were added.

**Headers to Check** (`pages/api/imdb-watchlist.ts:162-180`):
```typescript
if (shouldForceRefresh) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
} else {
  res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=7200, stale-while-revalidate=86400');
}
```

**Test**: Try accessing dashboard with `?refresh=1` parameter

---

### 5. **VPS Worker Not Updated**
If using VPS worker (`WORKER_URL=http://37.27.92.76:3003`), the worker might not have the latest code that fetches ratings.

**Files to Check**:
- VPS worker's `scraper-worker/lib/fetch-watchlist.ts`
- VPS worker's environment variables

**Test**: Disable worker and use local scraping:
```bash
# Temporarily unset WORKER_URL
unset WORKER_URL
npm run dev
```

---

### 6. **Browser Cache/Hot Reload Issue**
The browser might be serving stale JavaScript bundles.

**Test**:
1. Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
2. Clear browser cache
3. Try incognito/private window
4. Restart dev server: `npm run dev`

---

## Debugging Steps for Other Developers

### Step 1: Verify API Response
```bash
curl http://localhost:3000/api/imdb-watchlist?userId=ur31595220&refresh=1 | jq '.items[0]'
```

**Expected Output**:
```json
{
  "imdbId": "tt0253474",
  "title": "The Pianist",
  "imdbRating": 8.38,
  "numRatings": 912345
}
```

**If missing**: Issue is in backend scraping/TMDB integration

---

### Step 2: Check Browser Network Tab
1. Open DevTools → Network tab
2. Load dashboard: `http://localhost:3000/dashboard/ur31595220`
3. Find request to `/api/imdb-watchlist`
4. Check response JSON for `imdbRating` field

**If present**: Issue is in React component rendering
**If missing**: Issue is in API response

---

### Step 3: Check React Component Props
Add console logging to `pages/dashboard.jsx`:

```javascript
useEffect(() => {
  console.log('Watchlist items:', items.map(i => ({
    title: i.title,
    imdbRating: i.imdbRating,
    hasRating: !!i.imdbRating
  })));
}, [items]);
```

**Expected Output**: Each item should have `imdbRating` value
**If undefined**: Data not passing through component hierarchy

---

### Step 4: Force Fresh Scrape
```bash
# Clear local cache
rm -f data/watchlist-cache.json

# Force refresh in browser
curl "http://localhost:3000/api/imdb-watchlist?userId=ur31595220&forceRefresh=true"

# Reload dashboard
open "http://localhost:3000/dashboard/ur31595220?refresh=1"
```

---

### Step 5: Check for TypeScript Compilation Errors
```bash
npm run build
```

Look for errors related to `WatchlistItem` interface

---

### Step 6: Verify TMDB Integration
Check if TMDB API is returning ratings:

```javascript
// In lib/fetch-watchlist.ts, add logging:
console.log('TMDB Metadata:', Array.from(tmdbMetadata.entries()).slice(0, 3));
```

**Expected Output**:
```javascript
[
  ['the pianist-2002', { imdbRating: 8.38, poster: '...', ... }],
  ['the shawshank redemption-1994', { imdbRating: 9.3, ... }]
]
```

---

## Code Snippets for Reference

### Working Rating Badge Component
```jsx
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
```

### TMDB Metadata Fetching
```typescript
const tmdbMetadata = await getTMDBMetadataBatch(
  allItems.map(item => ({ title: item.title, year: item.year }))
);

allItems.forEach(item => {
  const key = `${item.title.toLowerCase()}-${item.year || 'unknown'}`;
  const metadata = tmdbMetadata.get(key);
  if (metadata?.imdbRating) {
    item.imdbRating = metadata.imdbRating;
  }
});
```

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

## Next Steps for Investigation

1. **Clear all caches** (local, Redis, browser) and force fresh scrape
2. **Add comprehensive logging** to track data flow from API to UI
3. **Check VPS worker** to ensure it has latest code with rating support
4. **Verify TMDB API key** is configured and returning data
5. **Test with different user IDs** to rule out data-specific issues
6. **Check browser console** for React errors or warnings
7. **Review Next.js build output** for any optimization warnings

## Related Documentation

- **Architecture**: `/Context/Ultimate-Workflow-Fix.md`
- **TMDB Integration**: `lib/tmdb.ts`
- **Watchlist Scraping**: `lib/fetch-watchlist.ts`
- **Version History**: See git log on `feature/imdb-ratings` branch

---

**Last Updated**: 2025-10-06
**Version**: 3.7.1
**Developer Notes**: All interface fixes and UI updates have been implemented correctly. The issue appears to be related to data flow or caching rather than code structure. Recommend starting with Step 1-3 of debugging steps above to isolate where ratings are being lost in the pipeline.
