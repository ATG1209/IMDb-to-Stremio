# Series Count Issue - Comprehensive Debug Document

## Issue Summary
**Status**: ACTIVE BUG
**Severity**: HIGH - Core functionality broken
**User Impact**: Dashboard shows 0 series despite having TV shows in watchlist (422 total items, 369 movies, 0 series)

## Problem Description
The app fails to correctly identify and count TV series in the user's IMDb watchlist. All content is being classified as "movie" type even when TV series are present.

### Visual Evidence
- Dashboard displays: "422 Total Items", "369 Movies", "0 Series"
- When filtering by "Series" only, no results appear
- Expected: Should show ~50+ TV series based on typical IMDb watchlist distribution

## System Architecture Context

### Data Flow
```
User's IMDb Watchlist
    ↓
VPS Worker (37.27.92.76:3003) - Scrapes with Playwright
    ↓
Redis Cache (24-hour TTL)
    ↓
Vercel API (/api/imdb-watchlist)
    ↓
React Component (CatalogPreview)
    ↓
UI Display
```

### Key Components
1. **VPS Worker** (`scraper-worker` on VPS)
   - Location: `37.27.92.76:3003`
   - Scrapes IMDb watchlists using Playwright
   - Returns items with `type: 'movie' | 'tv'` field
   - Has Redis cache with 24-hour TTL

2. **Vercel API** (`pages/api/imdb-watchlist.ts`)
   - Fetches data from VPS worker
   - Should detect content types using TMDB
   - Returns data to frontend

3. **Frontend** (`components/CatalogPreview.jsx`)
   - Displays watchlist items
   - Filters by type (movies vs series)
   - Shows counts in dashboard

## Root Cause Analysis

### Initial Scraping (lib/fetch-watchlist.ts:358-360)
```typescript
const type = (contextText.includes('series') || contextText.includes('tv') ||
             contextText.includes('show') || contextText.includes('episode')) ? 'tv' : 'movie';
```
**Problem**: Basic text detection fails to identify most TV series. Defaults everything to 'movie'.

### Content Type Detection (Attempted Fix)
Located in `lib/tmdb.ts:353-406` - `detectContentTypeBatch()`
- Uses TMDB API to search both movie and TV databases
- Compares popularity scores to determine correct type
- **Should** run after scraping to correct types

### Current Implementation Status
**Fix Location**: `pages/api/imdb-watchlist.ts:83-105`

```typescript
// CRITICAL FIX: Detect correct content types using TMDB
console.log('[Web App] Detecting content types for worker items...');
try {
  const contentTypes = await detectContentTypeBatch(
    items.map(item => ({ title: item.title, year: item.year }))
  );

  items.forEach(item => {
    const key = `${item.title}_${item.year || 'unknown'}`;
    const detectedType = contentTypes.get(key);
    if (detectedType) {
      item.type = detectedType;
    }
  });

  const movieCount = items.filter(item => item.type === 'movie').length;
  const tvCount = items.filter(item => item.type === 'tv').length;
  console.log(`[Web App] Content type detection complete: ${movieCount} movies, ${tvCount} TV series`);
} catch (error) {
  console.error('[Web App] Error detecting content types:', error);
}
```

**This code should work but ISN'T running or ISN'T fixing the types.**

## Debugging Steps Already Attempted

### Attempt 1: Added TMDB Detection (v3.3.0)
- Added `detectContentTypeBatch()` call in `/api/imdb-watchlist`
- Used dynamic import initially
- **Result**: No change in UI

### Attempt 2: Fixed Import (v3.3.1)
- Changed from dynamic to static import
- Reasoning: Vercel edge runtime might not support dynamic imports
- **Result**: Still showing 0 series

### Attempt 3: User Refresh
- User clicked "Refresh" button to bypass cache
- Should trigger `forceRefresh=true` parameter
- **Result**: Still showing 0 series

## Potential Issues to Investigate

### 1. TMDB API Call Not Executing
**Check**: Are the TMDB API calls actually running in production?

**Debug Steps**:
```bash
# Check Vercel logs for these messages:
- "[Web App] Detecting content types for worker items..."
- "[TMDB Content Detection] Processing X items"
- "[Web App] Content type detection complete: X movies, Y TV series"
```

**How to Check**:
```bash
# In Vercel dashboard:
vercel logs --follow
# Or use Vercel CLI
vercel logs <deployment-url>
```

### 2. VPS Worker Cache Not Invalidating
**Issue**: VPS Redis cache may be serving stale data with wrong types

**Evidence Needed**:
- Check if `forceRefresh=true` actually bypasses VPS cache
- Check VPS worker logs for cache hits vs fresh scrapes

**Debug Steps**:
```bash
# On VPS (ask VPS dev):
# Check cache for user
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data[0].type'

# Clear cache manually
redis-cli DEL "watchlist:ur31595220"

# Trigger fresh scrape
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'
```

### 3. TMDB API Key Issues
**Check**: Is TMDB API configured in Vercel?

**Environment Variable Required**:
```bash
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
```

**Verify in Vercel**:
1. Go to Vercel Dashboard → Project Settings → Environment Variables
2. Check if `TMDB_API_KEY` exists for Production
3. If missing, add and redeploy

### 4. TMDB Detection Logic Failing
**Possible Issues**:
- TMDB API rate limiting (40 requests/sec max)
- Network timeout in Vercel serverless function
- Detection returning 'movie' for everything due to API errors

**Test Locally**:
```bash
# Run local server
npm run dev

# Test API endpoint
curl "http://localhost:3000/api/imdb-watchlist?userId=ur31595220&forceRefresh=true"

# Check console logs for TMDB detection
```

### 5. Data Type Mismatch
**Check**: Verify the actual data structure returned by VPS worker

**API Response Structure Expected**:
```typescript
interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';  // THIS FIELD IS CRITICAL
  poster?: string;
  addedAt: string;
}
```

**Debug Command**:
```bash
# Check actual VPS response
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | \
  jq '.data | map(.type) | group_by(.) | map({type: .[0], count: length})'
```

### 6. Frontend Not Re-rendering
**Issue**: UI may be caching old data in React state

**Debug Steps**:
1. Open browser DevTools → Network tab
2. Click "Refresh" button
3. Check `/api/imdb-watchlist` response
4. Verify response has correct `type` fields

**Browser Console Check**:
```javascript
// In browser console on simple-dashboard page
// Check the actual data loaded
console.log(JSON.stringify(
  window.__NEXT_DATA__.props.pageProps,
  null, 2
));
```

## Files Involved

### Backend
- `/pages/api/imdb-watchlist.ts` - Main API endpoint (TMDB detection added here)
- `/lib/fetch-watchlist.ts` - Direct scraping logic (lines 486-509 have detection)
- `/lib/tmdb.ts` - TMDB API client (lines 353-406: `detectContentTypeBatch`)
- `/lib/vpsWorkerClient.ts` - VPS communication

### Frontend
- `/components/CatalogPreview.jsx` - Displays watchlist (lines 103-104: filtering logic)
- `/pages/simple-dashboard.jsx` - Main dashboard page

### Configuration
- `/lib/version.ts` - Current version: 3.3.1
- `.env` - Local TMDB API key (must also be in Vercel)

## Testing Strategy

### Local Testing
```bash
# 1. Start local server
npm run dev

# 2. Test API endpoint with force refresh
curl "http://localhost:3000/api/imdb-watchlist?userId=ur31595220&forceRefresh=true" | jq '.items | map(.type) | unique'

# Should return: ["movie", "tv"]
# If returns only ["movie"], TMDB detection is failing
```

### Production Testing
```bash
# 1. Check Vercel logs
vercel logs --follow

# 2. Test production API
curl "https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220&forceRefresh=true" | jq '.items | map(.type) | unique'

# 3. Compare with VPS worker data
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | \
  jq '.data | map(.type) | unique'
```

### Expected vs Actual Output

**Expected**:
```json
{
  "items": [...],
  "totalItems": 422,
  "movies": 370,
  "series": 52
}
```

**Actual**:
```json
{
  "items": [...],
  "totalItems": 422,
  "movies": 422,
  "series": 0
}
```

## Recommended Next Steps

### Immediate Actions
1. **Check Vercel Logs**
   - Verify TMDB detection code is executing
   - Look for error messages in try/catch block
   - Check for TMDB API errors

2. **Verify VPS Worker**
   - Ask VPS dev to check if content type detection runs on their end
   - Clear Redis cache for test user
   - Trigger fresh scrape with logging

3. **Test TMDB Locally**
   ```bash
   npm run dev
   # Open http://localhost:3000/simple-dashboard
   # Enter user ID: ur31595220
   # Click Refresh button
   # Check terminal logs for TMDB detection messages
   ```

4. **Add Debug Logging**
   - Add console.log before/after TMDB detection
   - Log individual item types before and after detection
   - Log TMDB API responses

### Long-term Solutions

#### Option A: Move Detection to VPS Worker
**Best approach** - Centralize content type detection where scraping happens

**Files to Modify** (on VPS):
- Add `detectContentTypeBatch()` to VPS worker
- Run detection immediately after scraping
- Store corrected types in Redis cache

**Advantages**:
- ✅ Single source of truth
- ✅ Cache stores correct data
- ✅ Faster for users (no detection on every request)

#### Option B: Fix Vercel Detection
**Current approach** - Make sure detection runs reliably in Vercel

**Files to Modify**:
- Add comprehensive error handling
- Add detailed logging
- Implement retry logic for TMDB failures
- Add response caching to avoid redundant calls

**Advantages**:
- ✅ No VPS changes needed
- ✅ Can deploy immediately

#### Option C: Hybrid Approach
- VPS worker does initial detection and caching
- Vercel API validates and fixes on demand
- Use FORCE_TV override list in `lib/tmdb.ts:36-41` for known series

## Environment Variables Reference

### Vercel (Production)
```bash
NODE_ENV=production
WORKER_URL=http://37.27.92.76:3003
WORKER_SECRET=imdb-worker-2025-secret
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac  # VERIFY THIS EXISTS
```

### VPS Worker
```bash
NODE_ENV=production
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
DEFAULT_IMDB_USER_ID=ur31595220
WORKER_SECRET=imdb-worker-2025-secret
REDIS_URL=redis://localhost:6379
```

## Known Working Code

### TMDB Detection Function
Located: `lib/tmdb.ts:353-406`
```typescript
export async function detectContentTypeBatch(
  items: Array<{ title: string; year?: string }>
): Promise<Map<string, 'movie' | 'tv'>>
```

**Status**: ✅ Function exists and should work
**Testing**: Needs manual verification in production

### Fast Path Override Lists
Located: `lib/tmdb.ts:36-41`
```typescript
const FORCE_TV = [
  'Six Feet Under', 'The Shield', 'Utopia', 'Mindhunter',
  'Sugar', 'Ozark', 'Dark Matter', 'Slow Horses',
  'Counterpart', 'Mr. Robot', 'Silo', 'Brilliant Minds',
  'Chernobyl', 'Squid Game', 'The Day of the Jackal',
  'One Hundred Years of Solitude', 'Nobody Wants This',
  'The Bear'
];
```

**Usage**: Add known series titles here for instant classification (bypasses TMDB API)

## Contact & Resources

### VPS Access
- **IP**: 37.27.92.76
- **Port**: 3003
- **Auth**: Bearer token `imdb-worker-2025-secret`
- **Contact**: VPS dev (via user)

### TMDB API
- **Docs**: https://developers.themoviedb.org/3
- **Rate Limit**: 40 requests/second
- **Search Movie**: `/search/movie?query={title}&year={year}`
- **Search TV**: `/search/tv?query={title}&first_air_date_year={year}`

### Deployment URLs
- **Production**: https://imdb-migrator.vercel.app
- **API Test**: https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220
- **Manifest**: https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=3.3.1

---

**Last Updated**: 2025-10-02
**Current Version**: 3.3.1
**Assignee**: Open for any developer
**Priority**: HIGH - Blocks core functionality
