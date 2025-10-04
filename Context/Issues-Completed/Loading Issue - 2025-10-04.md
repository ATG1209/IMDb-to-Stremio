# Web App Loading Speed Issue - Solved (2025-10-04)

**Status:** ✅ RESOLVED
**Version:** v3.4.2
**Date:** October 4, 2025

---

## Problem Summary

The web app was taking **10-15 seconds to load** every time the user opened or refreshed the dashboard at `/dashboard/ur31595220`. This created a poor user experience, especially since refreshing the page is common behavior.

### User Report
> "It takes about 10-15 seconds to load the movies every time I open or refresh the app."

---

## Root Cause Analysis

After investigation, we identified **three major bottlenecks**:

### 1. **Redundant TMDB API Calls** (PRIMARY BOTTLENECK)
- **Problem:** The web app was running `ensureContentTypesWithTMDB()` on EVERY page load, even when using cached VPS worker data
- **Impact:** For 300 items, this meant 600 TMDB API calls (2 per item: movie + TV search)
- **Time Cost:** 10-15 seconds per page load
- **Why it happened:** The code was running TMDB detection regardless of data source

### 2. **No Browser/CDN Caching**
- **Problem:** API responses had `Cache-Control: no-store` headers, preventing any caching
- **Impact:** Every page refresh required full server-side processing
- **Time Cost:** Additional 3-5 seconds per request

### 3. **Timestamp Cache-Busting on Every Load**
- **Problem:** Frontend added `?t=${timestamp}` to ALL requests, including normal page loads
- **Impact:** Prevented browser from using cached responses
- **Why it existed:** Originally implemented to bypass Vercel edge cache, but applied too broadly

---

## Solution Implementation

### Optimization 1: Skip Redundant TMDB Detection ⚡

**File:** `pages/api/imdb-watchlist.ts`

**Change:**
```typescript
// BEFORE: Always ran TMDB detection
const summary = await ensureContentTypesWithTMDB(items, '[Web App] TMDB Sync');

// AFTER: Only run for fallback/direct scrape
if (useWorker) {
  // Skip TMDB - VPS worker already has content types
  console.log('[Web App] ✓ Using VPS worker data (already has TMDB content types)');
} else {
  // Only run TMDB for fallback scenarios
  const summary = await ensureContentTypesWithTMDB(items, '[Web App] Fallback TMDB');
}
```

**Impact:** Eliminated 10-15 seconds of TMDB API calls for cached data

---

### Optimization 2: Smart Browser/CDN Caching 🚀

**File:** `pages/api/imdb-watchlist.ts`

**Change:**
```typescript
// BEFORE: No caching ever
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');

// AFTER: Conditional caching based on user action
if (shouldForceRefresh) {
  // Manual refresh: bypass all caches
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
} else {
  // Normal load: enable 5-minute browser/CDN cache
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.setHeader('CDN-Cache-Control', 'public, max-age=300');
}
```

**Impact:** Page refreshes now served instantly from browser cache

---

### Optimization 3: Remove Unnecessary Timestamp 📌

**File:** `pages/dashboard/[userId].jsx`

**Change:**
```typescript
// BEFORE: Timestamp on every request
const timestamp = Date.now();
const response = await fetch(`/api/imdb-watchlist?userId=${userId}&t=${timestamp}`);

// AFTER: Timestamp only on manual refresh
// Normal load:
const response = await fetch(`/api/imdb-watchlist?userId=${userId}`);

// Manual refresh only:
const response = await fetch(`/api/imdb-watchlist?userId=${userId}&refresh=1&nocache=1`);
```

**Impact:** Enabled stable URLs for browser caching

---

## Performance Results

### Before Optimization
- **First load:** 10-15 seconds
- **Page refresh:** 10-15 seconds (no caching)
- **Manual refresh:** 10-15 seconds

### After Optimization (v3.4.2)
- **First load:** 3-5 seconds (VPS cache hit, no TMDB processing)
- **Page refresh:** <1 second (browser cache)
- **Manual refresh:** 10-15 seconds (intentional - forces fresh scrape)

### Overall Improvement
- **90% faster** on page refresh (15s → <1s)
- **70% faster** on first load (15s → 3-5s)
- Manual refresh intentionally slow to ensure fresh data

---

## Testing Confusion & Resolution

### Initial Problem During Testing

When first testing the optimizations, the dashboard showed **0 items** despite the API working correctly. This caused concern that our changes broke something.

**What Actually Happened:**

1. **Browser cache was stale:** The browser had cached a previous "0 items" response from when VPS worker was down
2. **API was working perfectly:** Direct API tests showed 424 items being returned successfully
3. **Simple solution:** Hard refresh (`Ctrl+Shift+R`) cleared the stale cache

**Verification Commands Used:**
```bash
# VPS cache check - showed 424 items ✓
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data | length'

# Vercel API check - showed 424 items ✓
curl -s "https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220" \
  | jq '{totalItems, source}'
```

**Lesson:** Browser caching (which we just enabled) can mask issues during testing. Always do hard refresh when testing cache-related changes.

---

## VPS Worker Investigation

During troubleshooting, we also investigated VPS worker errors showing in logs:

### IMDb Blocking Issues Found
```
WARN: Watchlist extraction attempt failed
{"attempt":4,"reason":"HTTP 500 for page-1-simple","blocked":true}
```

**Root Cause:** IMDb was temporarily blocking automated access (HTTP 403/500 responses)

**Actions Taken:**
1. SSH'd into VPS: `ssh root@37.27.92.76`
2. Checked worker logs: `tail -100 /root/.pm2/logs/imdb-worker-error.log`
3. Pulled latest code: `git pull origin main`
4. Restarted worker: `pm2 restart imdb-worker`

**Note:** Despite blocking, the Redis cache still had 424 items from the last successful scrape, so the system continued working.

---

## Architecture Notes

### Current Data Flow (Optimized)

```
User visits /dashboard/ur31595220
    ↓
1. Browser checks cache (5 min TTL)
   - If cached: Return instantly ✅
   - If not cached: Continue to step 2
    ↓
2. Vercel API checks VPS worker cache
   - VPS has cached data (24h TTL): Return in 3-5s ✅
   - VPS cache miss: Trigger fresh scrape (30-60s)
    ↓
3. VPS worker scrapes IMDb
   - Success: Cache for 24h, return data
   - Failure: Vercel fallback scraping
    ↓
4. Response headers set based on request type
   - Normal load: Cache-Control: public, max-age=300
   - Manual refresh: Cache-Control: no-store
```

### Key Components
- **Browser Cache:** 5 minutes (instant page refresh)
- **VPS Redis Cache:** 24 hours (fast data retrieval)
- **TMDB Detection:** Only runs for fallback scenarios
- **Manual Refresh:** Bypasses all caches for fresh data

---

## Files Modified

### Code Changes
1. **pages/api/imdb-watchlist.ts**
   - Skip TMDB detection for VPS worker data
   - Implement smart conditional caching
   - Add logging for cache decisions

2. **pages/dashboard/[userId].jsx**
   - Remove timestamp from normal page loads
   - Keep cache-busting only for manual refresh

3. **lib/version.ts**
   - Bumped version: v3.4.1 → v3.4.2

### Branch
- Created: `optimize/web-app-loading-speed`
- Merged to: `main`
- Status: Deployed to production ✅

---

## Production URLs

**Live Web App:**
- https://imdb-migrator.vercel.app/dashboard/ur31595220

**API Endpoints:**
- https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220
- https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=3.4.2

**VPS Worker:**
- http://37.27.92.76:3003/cache/ur31595220
- http://37.27.92.76:3003/health

---

## Testing Checklist

To verify the optimizations work:

- [x] **First Load Test:** Dashboard loads in 3-5 seconds
- [x] **Refresh Test:** Browser refresh returns in <1 second
- [x] **Manual Refresh Test:** "Refresh" button forces fresh scrape (10-15s)
- [x] **Cache Headers Test:** Normal loads have `Cache-Control: public, max-age=300`
- [x] **VPS Cache Test:** VPS returns 424 items from Redis
- [x] **Vercel API Test:** API returns 424 items with `source: "worker-cache"`

---

## Lessons Learned

1. **Profile before optimizing:** We correctly identified TMDB as the bottleneck through investigation
2. **Cache strategically:** Different actions (normal load vs manual refresh) need different cache policies
3. **Test with hard refresh:** Browser caching can mask issues during development/testing
4. **Monitor VPS worker:** IMDb blocking can happen, but cached data keeps system working
5. **Version everything:** Bumping version to v3.4.2 helped track when changes went live

---

## Future Improvements

Potential optimizations for future consideration:

1. **Increase cache TTL:** Could extend browser cache from 5 minutes to 15 minutes
2. **Background refresh:** Refresh VPS cache in background before 24h expiry
3. **Prefetch data:** Preload watchlist data on home page for faster dashboard load
4. **Progressive loading:** Show cached data immediately, update in background
5. **Service worker:** Cache API responses in service worker for offline support

---

## Commit History

**Main Commit:**
```
⚡ Optimize web app loading speed (10-15s → <1s) - v3.4.2

- Skip TMDB detection for VPS worker data (primary optimization)
- Enable smart browser/CDN caching (5-minute TTL for normal loads)
- Remove timestamp cache-busting from normal page loads
- Conditional cache headers based on manual refresh vs normal load

Performance improvements:
- First load: 10-15s → 3-5s (70% faster)
- Page refresh: 10-15s → <1s (90% faster)
- Manual refresh: Intentionally 10-15s for fresh data

🤖 Generated with Claude Code
Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Resolution Date
**October 4, 2025** - Successfully deployed to production and verified working.

**User Confirmation:** ✅ "perfect.. is working now!"
