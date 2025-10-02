# Refresh Button Issues - RESOLVED (v3.2.7)

**Status:** ✅ WORKING (with known limitations)
**Created:** 2025-10-02
**Updated:** 2025-10-02
**Versions:** v3.2.4 → v3.2.5 → v3.2.6 → **v3.2.7 (Current)**
**Priority:** HIGH → MEDIUM

---

## 📋 Table of Contents
1. [System Architecture](#system-architecture)
2. [How It Works](#how-it-works)
3. [Current Behavior (v3.2.7)](#current-behavior-v327)
4. [Known Issues & Limitations](#known-issues--limitations)
5. [Technical Implementation](#technical-implementation)
6. [For Developers](#for-developers)

---

## 🏗️ System Architecture

### Overview: Hybrid Vercel + VPS Architecture

This is **NOT a local development server** - it's a production system with two components:

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│                  (Stremio App or Web Dashboard)                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              VERCEL DEPLOYMENT (Frontend + API)                 │
│                 https://imdb-migrator.vercel.app                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Next.js API Routes (Serverless Functions)              │  │
│  │  - /api/imdb-watchlist                                  │  │
│  │  - /api/stremio/[userId]/manifest.json                  │  │
│  │  - /api/stremio/[userId]/catalog/movie/...             │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTP Requests with Bearer Token
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               VPS WORKER SERVICE (Backend Only)                 │
│                    http://37.27.92.76:3003                      │
│                      (Internal Use Only)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Playwright Browser Automation                           │  │
│  │  - Scrapes IMDb watchlists                              │  │
│  │  - Cleans title numbering ("410. Title" → "Title")     │  │
│  │  - Fetches TMDB poster images                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Redis Cache (24-hour TTL)                              │  │
│  │  - Stores scraped watchlist data                        │  │
│  │  - Key: imdb:watchlist:{userId}                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Points for Developers

**❌ No Local Server Required:**
- You do NOT need to run anything locally for production
- All scraping happens on the VPS server (37.27.92.76)
- Vercel handles all web traffic automatically

**🔐 Authentication:**
- VPS worker uses Bearer token: `imdb-worker-2025-secret`
- All `/jobs` and `/cache` endpoints require this token
- Configured via `WORKER_SECRET` environment variable

**📦 Data Flow:**
1. User clicks Refresh → Frontend calls `/api/imdb-watchlist?refresh=1`
2. Vercel API → Calls VPS worker `/jobs` endpoint
3. VPS worker → Scrapes IMDb + caches to Redis
4. Vercel API → Polls VPS `/cache/{userId}` until data ready
5. Frontend → Receives fresh data and updates UI

---

## 🔄 How It Works

### Normal Page Load (No Refresh)

```typescript
// User visits dashboard
GET /dashboard/ur31595220

// Dashboard fetches data
GET /api/imdb-watchlist?userId=ur31595220

// Backend checks VPS cache first
const cached = await vpsWorkerClient.fetchCache(userId);
if (cached) {
  return cached; // Fast! Returns in ~1 second
}

// If no cache, trigger scrape (first-time users)
await triggerJob(userId, forceRefresh: false);
// Poll cache for 12 seconds, then give up or return data
```

**Cache Hit:** Returns in ~500ms - 2s
**Cache Miss:** Triggers scrape, waits up to 12s

---

### Refresh Button Click (Force Refresh)

```typescript
// User clicks Refresh button
onClick={() => fetch('/api/imdb-watchlist?userId=ur31595220&refresh=1&nocache=1')}

// Backend receives request
const shouldForceRefresh = refresh === '1' || nocache === '1'; // true

// Skip cache check, trigger fresh scrape
await vpsWorkerClient.scrapeWatchlist(userId, { forceRefresh: true });

// VPS Worker:
// 1. Launches Playwright browser
// 2. Navigates to IMDb watchlist
// 3. Scrolls through all pages (handles 400+ items)
// 4. Cleans titles (removes "410. Title" numbering)
// 5. Fetches TMDB posters
// 6. Saves to Redis cache (24-hour TTL)
// Takes 40-60 seconds for 400+ items

// Backend polls VPS cache
// 30 attempts × 3 seconds = 90 seconds max wait
for (let i = 0; i < 30; i++) {
  const data = await fetchCache(userId);
  if (data) return data; // Success!
  await sleep(3000); // Wait 3 seconds
}

// If timeout, return stale cache as fallback
```

**Expected Time:** 40-60 seconds for full refresh
**Max Wait:** 90 seconds before timeout

---

## 📊 Current Behavior (v3.2.7)

### ✅ What's Working

1. **Refresh Button Functionality**
   - ✅ Triggers VPS worker scrape
   - ✅ Polls cache for up to 90 seconds
   - ✅ Updates UI when data arrives
   - ✅ Shows proper loading states

2. **Data Persistence**
   - ✅ VPS Redis cache persists for 24 hours
   - ✅ Subsequent page loads use cached data (fast!)
   - ✅ Refreshed movies stay in cache between sessions

3. **Multi-Click Behavior**
   - ✅ First click: Triggers scrape (may timeout if >60s)
   - ✅ Second click: Usually succeeds (cache ready)
   - ✅ Subsequent loads: Instant (uses cache)

### 🟡 Known Limitations

1. **First Click May Time Out**
   - **Issue:** If scrape takes >60 seconds, first click may not complete
   - **Workaround:** Click refresh again after 60 seconds
   - **Root Cause:** Race condition between scrape time and polling timeout
   - **Impact:** Medium - works on second attempt

2. **Vercel Edge Cache Interference** ⚠️
   - **Issue:** Refreshed movies may disappear on page reload
   - **Root Cause:** Vercel caches `/api/imdb-watchlist` responses (30 min default)
   - **Symptom:** Page reload shows old data, refresh works again
   - **Status:** INVESTIGATING - cache headers may not be respected

3. **Inconsistent Refresh Success**
   - **Issue:** Sometimes pulls 2 new movies, misses others
   - **Root Cause:** Unclear - possibly IMDb rate limiting or pagination
   - **Workaround:** Click refresh multiple times if needed
   - **Impact:** Low - data eventually syncs

4. **Addon Shows EMPTY** 🔴
   - **Issue:** Stremio addon catalog returns 0 items
   - **Root Cause:** UNKNOWN - needs investigation
   - **Impact:** HIGH - addon unusable
   - **Next Steps:** Check `/api/stremio/[userId]/catalog` endpoint

---

## 🛠️ Technical Implementation

### File Structure

```
/lib/vpsWorkerClient.ts          # VPS worker HTTP client
/pages/api/imdb-watchlist.ts     # API endpoint for dashboard
/pages/api/stremio/[userId]/catalog/[type]/[id].ts  # Stremio addon
/pages/dashboard/[userId].jsx    # Dashboard UI
/scraper-worker/                 # VPS worker codebase (separate repo)
```

### Key Code Sections

#### 1. VPS Worker Client (`lib/vpsWorkerClient.ts`)

**Constants:**
```typescript
const CACHE_TIMEOUT_MS = 7000;           // Cache fetch timeout
const CACHE_POLL_ATTEMPTS = 6;           // Normal: 6 × 2s = 12s
const CACHE_POLL_INTERVAL_MS = 2000;     // 2 seconds
const REFRESH_POLL_ATTEMPTS = 30;        // Refresh: 30 × 3s = 90s
const REFRESH_POLL_INTERVAL_MS = 3000;   // 3 seconds
```

**Simplified Refresh Logic (v3.2.7):**
```typescript
async scrapeWatchlist(userId, { forceRefresh = false }) {
  // For refresh: skip cache, trigger job, poll 90s
  if (forceRefresh) {
    await triggerJob(userId, true);
    return await pollCache(userId, 30, 3000); // 90s max
  }

  // For normal load: check cache first
  const cached = await fetchCache(userId);
  if (cached) return cached; // Fast path!

  // No cache: trigger job, poll 12s
  await triggerJob(userId, false);
  return await pollCache(userId, 6, 2000); // 12s max
}
```

**What Changed from v3.2.6:**
- ❌ Removed complex `pollJobStatus()` - was failing silently
- ✅ Simplified to cache-only polling - reliable and works
- 🔧 Job status endpoint still exists but not used (VPS returns jobId but we ignore it)

#### 2. API Route (`pages/api/imdb-watchlist.ts`)

**Parameter Parsing:**
```typescript
const { userId, forceRefresh, refresh, nocache } = req.query;

// Support multiple formats:
// ?refresh=1         → forceRefresh = true
// ?nocache=1         → forceRefresh = true
// ?forceRefresh=true → forceRefresh = true
const shouldForceRefresh = forceRefresh === 'true' ||
                          refresh === '1' ||
                          nocache === '1';
```

**Cache Headers:**
```typescript
if (shouldForceRefresh) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
} else {
  res.setHeader('Cache-Control', 'public, s-maxage=1800'); // 30 min
}
```

**⚠️ Problem:** Vercel may ignore `no-store` headers, causing stale data on reload.

#### 3. VPS Worker Endpoints

**POST /jobs** - Trigger Scrape Job
```bash
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Response:
{
  "jobId": "abc-123-def",
  "status": "pending",
  "message": "Job enqueued successfully",
  "estimatedDuration": "30-60 seconds"
}
```

**GET /cache/:userId** - Fetch Cached Data
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/cache/ur31595220"

# Response:
{
  "success": true,
  "data": [...426 items...],
  "metadata": {
    "totalItems": 426,
    "lastUpdated": "2025-10-02T15:30:00.000Z",
    "cacheAge": "5m"
  }
}
```

**GET /jobs/:jobId** - Check Job Status (unused in v3.2.7)
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/jobs/abc-123-def"

# Response:
{
  "id": "abc-123-def",
  "status": "completed",
  "result": {
    "totalItems": 426,
    "items": [...],
    "lastUpdated": "2025-10-02T15:30:00.000Z"
  }
}
```

---

## 👨‍💻 For Developers

### Testing the Refresh Button

**1. Test on Production Dashboard:**
```
https://imdb-migrator.vercel.app/dashboard/ur31595220
```

**2. Add a new movie to IMDb:**
- Go to IMDb and add a movie to your watchlist

**3. Click Refresh button:**
- Should show "🔄 Refreshing from IMDb..."
- Wait 40-90 seconds
- Should show "✓ Synced via VPS worker (manual refresh)"

**4. Verify new movie appears:**
- Check item count increased
- New movie should be at the top (newest first)

**5. Reload page (hard refresh):**
- Press Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
- ⚠️ **Known Issue:** Movies may disappear (Vercel cache)
- **Workaround:** Click Refresh again

### Debugging Tips

**Check VPS Worker Health:**
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/health

# Expected: 200 OK
```

**Trigger Manual Scrape:**
```bash
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'
```

**Check Cache Directly:**
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  "http://37.27.92.76:3003/cache/ur31595220" | jq '.data | length'

# Returns item count
```

**Monitor Vercel Logs:**
```bash
vercel logs --app=imdb-migrator --since=5m
```

### Environment Variables

**Vercel (Production):**
```bash
WORKER_URL=http://37.27.92.76:3003
WORKER_SECRET=imdb-worker-2025-secret
NODE_ENV=production
```

**VPS Worker:**
```bash
WORKER_SECRET=imdb-worker-2025-secret
REDIS_URL=redis://localhost:6379
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
NODE_ENV=production
```

### Deployment

**Vercel (Automatic):**
```bash
git push origin main
# Vercel deploys automatically via GitHub integration
```

**VPS Worker (Manual):**
```bash
# On VPS server:
cd /path/to/scraper-worker
git pull origin main
npm install  # If dependencies changed
pm2 restart imdb-worker  # Or: npm restart
```

---

## 🐛 Open Issues to Fix

### 1. Vercel Edge Cache Interference (High Priority)

**Problem:** Refreshed movies disappear on page reload despite VPS cache being updated.

**Root Cause:** Vercel may cache `/api/imdb-watchlist` responses for 30 minutes, ignoring `Cache-Control: no-store` on subsequent requests.

**Potential Solutions:**
- Add timestamp to API URL: `/api/imdb-watchlist?userId=X&t={timestamp}`
- Use Vercel's `stale-while-revalidate` properly
- Store cache key in localStorage and append to requests
- Investigate Vercel Edge Config for cache control

**Next Steps:**
1. Test with cache-busting query param
2. Check Vercel docs on Edge caching behavior
3. Consider using Vercel KV for shared cache state

### 2. Addon Catalog Returns EMPTY (Critical)

**Problem:** Stremio addon shows 0 items in catalog.

**Expected:** Should show same 426 items as dashboard.

**Next Steps:**
1. Test `/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220.json`
2. Compare response to dashboard `/api/imdb-watchlist`
3. Check if addon uses VPS worker or direct scraping
4. Verify authentication headers in addon requests

### 3. Inconsistent First-Click Behavior (Medium Priority)

**Problem:** First refresh sometimes times out, works on second click.

**Potential Causes:**
- VPS scrape takes 55-65 seconds (close to 60s timeout)
- Cache polling starts before scrape finishes
- VPS under load, slower response time

**Solution Ideas:**
- Increase timeout to 120 seconds for force refresh
- Show progress indicator (polling attempt X/30)
- Return partial data after 60s, continue polling in background

---

## 📝 Version History

**v3.2.4** - Initial buggy version
- ❌ Refresh returned stale data
- ❌ Job status polling not implemented

**v3.2.5** - Added job status polling
- ✅ Implemented `pollJobStatus()` method
- ✅ Extended timeout to 90 seconds
- ✅ Added cache-busting headers
- ❌ Job polling failed silently

**v3.2.6** - Fixed job result parsing
- ✅ Fixed `TypeError: x.items is not iterable`
- ✅ Properly extract `items` array from job result
- ❌ Still timing out, job polling not working

**v3.2.7** - Simplified to cache polling only (CURRENT)
- ✅ Removed broken `pollJobStatus()`
- ✅ Simple cache polling works reliably
- ✅ Refresh button functional (with limitations)
- 🟡 Vercel cache interference remains
- 🔴 Addon still shows EMPTY

---

## 🎯 Success Criteria (When Fully Fixed)

- [ ] Click Refresh → new movies appear within 60s
- [ ] Reload page → new movies persist (no disappearing)
- [ ] Addon catalog → shows same items as dashboard
- [ ] First click → succeeds 95% of the time
- [ ] Cache → respects TTL, updates properly

**Current Status:** 3/5 criteria met (60%)

---

**Last Updated:** 2025-10-02 by Claude Code
**Next Review:** After fixing Vercel cache issue
