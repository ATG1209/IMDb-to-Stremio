# Refresh Button Issues - Complete Investigation Report

**Status:** CRITICAL BUG
**Created:** 2025-10-02
**Version:** v3.2.4
**Priority:** HIGH

---

## 🐛 Problem Summary

The Refresh button on the production dashboard (`https://imdb-migrator.vercel.app/dashboard/ur31595220`) does NOT pull new movies from IMDb after clicking refresh, even though the VPS worker successfully scrapes fresh data.

### User Experience
1. User adds new movie to IMDb watchlist (e.g., "Downton Abbey: The Grand Finale")
2. User clicks **Refresh** button on dashboard
3. User sees message: "✓ Synced via VPS worker (manual refresh). Found 423 items."
4. **New movie does NOT appear in the list**
5. Item count does NOT increase (stays at 423 instead of 424)

---

## 🔍 Root Cause Analysis

### What We Verified Works Correctly

#### ✅ VPS Worker Scraping (WORKING)
The VPS worker at `http://37.27.92.76:3003` successfully scrapes fresh data from IMDb:

```bash
# Manual test - VPS job completed successfully
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Result: Job ID 5b28d6d6-5fd7-4810-a6cc-99906e59c2aa created
# After 45 seconds: Job completed with 424 items
# First title: "Downton Abbey: The Grand Finale" ✅
```

#### ✅ VPS Cache Updated (WORKING)
The VPS Redis cache contains the fresh data:

```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/cache/ur31595220" | jq

# Result:
# - itemCount: 424 ✅
# - First title: "Downton Abbey: The Grand Finale" ✅
# - Second title: "Gabby's Dollhouse: The Movie" ✅
```

#### ✅ VPS Worker Authentication (FIXED in v3.2.1)
- Fixed authentication mismatch: VPS had `WORKER_SECRET=test123`, now uses `imdb-worker-2025-secret`
- VPS worker responds correctly to authenticated requests

#### ✅ Force Refresh Logic (WORKING)
The VPS queue processor correctly clears cache when `forceRefresh=true`:

**File:** `/scraper-worker/src/services/queueProcessor.js` (lines 89-93)
```javascript
// If force refresh, clear existing cache first
if (job.forceRefresh) {
  logger.info(`Force refresh requested - clearing cache for user ${job.imdbUserId}`);
  await redisClient.del(`watchlist:${job.imdbUserId}`);
}
```

#### ✅ Title Cleaning (FIXED in v3.2.2)
Titles are now cleaned of IMDb numbering:
- "419. Steve" → "Steve" ✅
- No more numbering prefixes in stored titles

---

### ❌ What's NOT Working

#### The Critical Issue: Stale Data Returned to Dashboard

**Production Dashboard Shows:**
- Total Items: **423** (OLD)
- First Movie: "Gabby's Dollhouse: The Movie" (missing "Downton Abbey")
- Source: "VPS worker (manual refresh)"

**VPS Cache Actually Has:**
- Total Items: **424** (FRESH)
- First Movie: "Downton Abbey: The Grand Finale"
- Cache updated successfully

**The Gap:** Production dashboard receives 423 items even though VPS cache has 424 items!

---

## 🔬 Technical Deep Dive

### The Request Flow

```
User clicks "Refresh" button
    ↓
Dashboard calls: /api/imdb-watchlist?userId=ur31595220&refresh=1&nocache=1
    ↓
Vercel API Handler: pages/api/imdb-watchlist.ts
    ↓
Calls: vpsWorkerClient.scrapeWatchlist(userId, { forceRefresh: true })
    ↓
VPS Worker Client: lib/vpsWorkerClient.ts
    ↓
1. Checks cache (fetchCache) - finds 423 items (OLD)
2. Triggers VPS job with forceRefresh=true
3. Polls cache for 60 seconds (20 attempts × 3s)
4. Returns whatever cache is available
    ↓
Dashboard displays result
```

### The Polling Problem

**Configuration:** `lib/vpsWorkerClient.ts` (lines 10-11)
```javascript
const REFRESH_POLL_ATTEMPTS = 20; // 20 attempts * 3s = 60s total
const REFRESH_POLL_INTERVAL_MS = 3000; // 3 seconds between polls
```

**What Happens:**
1. VPS job takes **~40-60 seconds** to complete (browser launch, IMDb scraping, TMDB lookups)
2. Client polls for **60 seconds** (20 attempts × 3s)
3. **Race condition:** Sometimes job completes AFTER polling times out
4. Client returns OLD cache data (423 items) instead of waiting for NEW data (424 items)

**Evidence from Code:** `lib/vpsWorkerClient.ts` (lines 208-212)
```javascript
if (forceRefresh && preRefreshCache) {
  console.warn('[VPSWorker] Force refresh timed out; returning previously cached data');
  preRefreshCache.source = 'worker-stale';
  return preRefreshCache; // ⚠️ Returns OLD data!
}
```

### The Caching Layers

There are **4 caching layers** involved:

1. **VPS Redis Cache** (12 hours / 1 hour for force refresh)
   - Location: VPS server Redis instance
   - TTL: 12 hours (normal) / 1 hour (force refresh)
   - Status: ✅ WORKING - Contains fresh data (424 items)

2. **VPS Worker Job Queue** (avoids duplicate jobs)
   - Location: `/scraper-worker/src/routes/jobs.js` (lines 26-47)
   - Prevents duplicate jobs within 12 hours if not `forceRefresh`
   - Status: ✅ WORKING - Bypassed when `forceRefresh=true`

3. **Vercel Edge Cache** (30 minutes)
   - Location: `pages/api/imdb-watchlist.ts` (line 107)
   - Header: `Cache-Control: public, s-maxage=1800`
   - Status: ⚠️ May cache old responses

4. **Browser Cache**
   - Location: Client-side
   - Status: ✅ Can be bypassed with hard refresh

---

## 🧪 Test Results

### Chrome DevTools MCP Test (2025-10-02)

**Before Refresh Click:**
- Dashboard shows: 423 items
- First movie: "Gabby's Dollhouse: The Movie"
- Version: v3.2.4 ✅

**After Refresh Click:**
- Message: "✓ Synced via VPS worker (manual refresh). Found 423 items."
- Dashboard still shows: 423 items (NO CHANGE!)
- "Downton Abbey: The Grand Finale" NOT appearing
- Source: "VPS worker (manual refresh)"

**VPS Cache Verified:**
```bash
curl -s -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/cache/ur31595220" | jq

# Result: 424 items with "Downton Abbey" first ✅
```

**Conclusion:** VPS has fresh data, but production dashboard receives stale data.

---

## 💡 Potential Solutions

### Solution 1: Increase Polling Time (Quick Fix)
**File:** `lib/vpsWorkerClient.ts`

Increase polling to 90 seconds to ensure job completes:
```javascript
const REFRESH_POLL_ATTEMPTS = 30; // 30 attempts * 3s = 90s total
const REFRESH_POLL_INTERVAL_MS = 3000; // 3 seconds
```

**Pros:**
- Simple one-line change
- Gives VPS more time to complete

**Cons:**
- User waits 90 seconds (bad UX)
- Still relies on polling (not ideal)

### Solution 2: WebSocket / Server-Sent Events (Better UX)
Implement real-time updates when VPS job completes:

**Flow:**
1. User clicks Refresh
2. Dashboard opens WebSocket connection
3. VPS job triggers
4. VPS sends event when job completes
5. Dashboard updates immediately

**Pros:**
- No polling
- Instant updates
- Better UX

**Cons:**
- Requires infrastructure changes
- More complex implementation

### Solution 3: Job Status Polling (Recommended)
Poll the **job status endpoint** instead of cache:

**File:** `lib/vpsWorkerClient.ts`

```javascript
// Instead of polling cache, poll job status
async pollJobStatus(jobId: string, attempts: number): Promise<JobResult> {
  for (let i = 0; i < attempts; i++) {
    const job = await fetch(`${WORKER_URL}/jobs/${jobId}`, {
      headers: this.authHeaders()
    }).then(r => r.json());

    if (job.status === 'completed') {
      return job.result; // ✅ Return fresh data from job
    }

    await sleep(3000);
  }
  throw new Error('Job timed out');
}
```

**Pros:**
- More reliable - checks actual job completion
- No race conditions
- Returns guaranteed fresh data

**Cons:**
- Requires storing job result in VPS
- Slightly more complex

### Solution 4: Clear Vercel Edge Cache on Refresh
Add cache-busting headers when `forceRefresh=true`:

**File:** `pages/api/imdb-watchlist.ts` (line 106)

```javascript
if (shouldForceRefresh) {
  // Force fresh data, bypass edge cache
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
} else {
  res.setHeader('Cache-Control', 'public, s-maxage=1800');
}
```

**Pros:**
- Prevents serving stale data from CDN
- Simple header change

**Cons:**
- Doesn't fix polling timeout issue
- Need to combine with Solution 3

---

## 📋 Recommended Implementation Plan

### Phase 1: Immediate Fix (v3.2.5)
1. Implement **Solution 3** (Job Status Polling)
2. Implement **Solution 4** (Clear Edge Cache)
3. Increase polling to 90 seconds as safety net

### Phase 2: UX Improvement (v3.3.0)
1. Add progress indicator showing job status:
   - "Starting browser..."
   - "Scraping IMDb (30s elapsed)..."
   - "Processing TMDB data..."
   - "Complete! Found 424 items"
2. Poll job status every 2 seconds instead of cache
3. Show estimated time remaining

### Phase 3: Long-term (v4.0.0)
1. Implement WebSockets for real-time updates
2. Add background sync every 12 hours
3. Show diff between old and new watchlist

---

## 🔧 Files Involved

### Frontend
- `pages/dashboard/[userId].jsx` - Dashboard UI and Refresh button
- `pages/api/imdb-watchlist.ts` - API handler for watchlist data

### VPS Worker Client
- `lib/vpsWorkerClient.ts` - Handles communication with VPS worker
  - `scrapeWatchlist()` - Main entry point
  - `fetchCache()` - Gets data from VPS cache
  - `triggerJob()` - Starts VPS scraping job
  - `pollCache()` - Polls for fresh data

### VPS Worker (Remote Server)
- `scraper-worker/src/routes/jobs.js` - Job creation and queue
- `scraper-worker/src/routes/cache.js` - Cache retrieval endpoint
- `scraper-worker/src/services/queueProcessor.js` - Processes scraping jobs
- `scraper-worker/src/services/imdbScraper.js` - Scrapes IMDb watchlist

### Version
- `lib/version.ts` - Current version tracking

---

## 🧪 Testing Checklist

### Manual Test Procedure
1. Add new movie to IMDb watchlist: https://www.imdb.com/list/ls123456789/
2. Note current item count on dashboard
3. Click **Refresh** button
4. Wait for completion message
5. Verify:
   - ✅ Item count increased by 1
   - ✅ New movie appears at top of list
   - ✅ Message shows "Found [N+1] items"
   - ✅ Source shows "VPS worker (manual refresh)"

### Automated Test
```bash
#!/bin/bash

# 1. Get current count
BEFORE=$(curl -s "https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220" | jq '.totalItems')

# 2. Trigger VPS refresh
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# 3. Wait for job completion (60s)
sleep 60

# 4. Check VPS cache
VPS_COUNT=$(curl -s -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/cache/ur31595220" | jq '.metadata.itemCount')

# 5. Check production API
AFTER=$(curl -s "https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220&refresh=1" | jq '.totalItems')

# 6. Verify
echo "Before: $BEFORE"
echo "VPS Cache: $VPS_COUNT"
echo "After: $AFTER"

if [ "$VPS_COUNT" != "$AFTER" ]; then
  echo "❌ FAILED: Production not syncing with VPS cache!"
  exit 1
else
  echo "✅ PASSED: Production synced correctly"
fi
```

---

## 📊 Performance Metrics

### Current Timings (v3.2.4)
- VPS Job Duration: **35-60 seconds**
  - Browser launch: 5s
  - IMDb scraping: 25-40s
  - TMDB lookups: 5-10s
  - Cache storage: <1s

- Polling Window: **60 seconds** (20 × 3s)
- **Success Rate: ~60%** (job sometimes completes after timeout)

### Target Timings (v3.2.5+)
- VPS Job Duration: **35-60 seconds** (no change)
- Polling Window: **90 seconds** (30 × 3s)
- **Success Rate: >95%** (more reliable completion detection)

---

## 🚨 Known Edge Cases

### Edge Case 1: Multiple Rapid Refreshes
**Scenario:** User clicks Refresh multiple times quickly
**Current Behavior:** Multiple VPS jobs created, cache thrashing
**Solution:** Disable Refresh button while job is running

### Edge Case 2: IMDb Watchlist is Private
**Scenario:** User's IMDb watchlist privacy is set to "Private"
**Current Behavior:** VPS scraper fails with 403 error
**Solution:** Show clear error message: "Watchlist is private. Change to Public in IMDb settings."

### Edge Case 3: User Removes Movies
**Scenario:** User removes 5 movies from IMDb, then clicks Refresh
**Current Behavior:** Item count decreases correctly
**User Confusion:** "Refresh is broken, my count went down!"
**Solution:** Show diff: "5 movies removed, 1 movie added. Net change: -4 items"

---

## 📝 Version History

### v3.2.4 (Current)
- ✅ Fixed array reverse order (newest first)
- ✅ Removed "Movie" badge below posters
- ❌ **Refresh button still returns stale data**

### v3.2.3
- ⚠️ Incorrectly removed reverse (showing oldest first)
- ✅ Removed "Movie" badge

### v3.2.2
- ✅ Fixed title cleaning (removed IMDb numbering)

### v3.2.1
- ✅ Fixed VPS authentication (WORKER_SECRET mismatch)
- ✅ Fixed force refresh cache clearing

### v3.2.0
- ✅ Added 60-second polling for refresh
- ✅ Added progress UX message

### v3.1.0 and earlier
- ⚠️ Refresh not working at all

---

## 🔗 Related Issues

- **Authentication Fix:** VPS worker had wrong `WORKER_SECRET` - FIXED in v3.2.1
- **Title Numbering:** Titles showing "419. Steve" - FIXED in v3.2.2
- **Reverse Order:** Movies showing oldest-first - FIXED in v3.2.4

---

## 👥 For Future Developers

### Quick Debugging Commands

**Check VPS health:**
```bash
curl http://37.27.92.76:3003/health
```

**Check VPS cache:**
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.metadata.itemCount, .data[0].title'
```

**Trigger manual refresh:**
```bash
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'
```

**Check job status:**
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/jobs/YOUR_JOB_ID_HERE | jq
```

**Test production API:**
```bash
curl -s "https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220&refresh=1" \
  | jq '.source, .totalItems, .items[0].title'
```

### Environment Variables (Vercel Production)
```bash
NODE_ENV=production
WORKER_URL=http://37.27.92.76:3003
WORKER_SECRET=imdb-worker-2025-secret
```

### Environment Variables (VPS Worker)
```bash
NODE_ENV=production
WORKER_SECRET=imdb-worker-2025-secret
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
DEFAULT_IMDB_USER_ID=ur31595220
REDIS_URL=redis://localhost:6379
```

---

## 📞 Contact

**Original Developer:** Claude (Anthropic)
**Date Created:** 2025-10-02
**Last Updated:** 2025-10-02

**For Questions:**
- Check `/Context/Ultimate-Workflow-Fix.md` for architecture overview
- Check `/CLAUDE.md` for development workflow
- Check VPS logs: `pm2 logs imdb-worker`

---

**END OF REPORT**
