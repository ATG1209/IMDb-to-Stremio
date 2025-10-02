# VPS Deployment Instructions - v2.8.2

**Date:** October 2, 2025
**Purpose:** Update VPS worker to use 12-hour cache TTL instead of 30 days

---

## 📋 What Changed

**Cache TTL Update:**
- **Before:** 30 days (2,592,000 seconds)
- **After:** 12 hours (43,200 seconds)

**Impact:**
- New IMDb watchlist items will appear in Stremio addon within 12 hours max
- Reduces stale data while maintaining performance benefits
- Automatic cache refresh on expiration

---

## 🚀 VPS Deployment Commands

**Copy and paste these commands into your VPS terminal:**

```bash
# Navigate to worker directory
cd scraper-worker

# Pull latest changes from GitHub
git pull origin main

# Verify the change was applied
grep -A2 "12 \* 60 \* 60" src/services/queueProcessor.js
# Expected output:
#   12 * 60 * 60, // 12 hours
#   JSON.stringify(watchlistItems)

# Restart the worker service
pm2 restart imdb-worker

# Check logs to verify restart
pm2 logs imdb-worker --lines 20
```

---

## ✅ Verification Steps

**1. Check service is running:**
```bash
pm2 status
# Should show "imdb-worker" with status "online"
```

**2. Test cache health:**
```bash
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://localhost:3003/health
# Expected: {"status":"healthy","timestamp":"..."}
```

**3. Clear existing cache (optional - force immediate refresh):**
```bash
# Connect to Redis
redis-cli

# Check current cache keys
KEYS watchlist:*

# (Optional) Delete a specific user's cache to force fresh scrape
DEL watchlist:ur31595220

# Exit Redis
exit
```

**4. Trigger test scrape:**
```bash
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Check job was queued
pm2 logs imdb-worker --lines 50 | grep "Job queued"
```

---

## 📊 Expected Behavior After Update

**Scenario 1: User has cached data**
- First request: Served from cache (instant)
- After 12 hours: Cache expires
- Next request: Triggers new scrape, returns fresh data

**Scenario 2: User adds new movie to IMDb**
- IMDb: User adds "The Matrix 5" to watchlist
- 0-12 hours: Addon still shows old cached data
- 12+ hours: Cache expires, next request scrapes fresh data
- Result: New movie appears in Stremio

**Scenario 3: Manual refresh**
- User can force refresh via API with `?forceRefresh=true`
- Bypasses cache, triggers immediate scrape
- Useful for testing or when user wants instant sync

---

## 🔍 Monitoring Cache Expiration

**Check cache TTL for a user:**
```bash
redis-cli

# Check remaining time (TTL in seconds)
TTL watchlist:ur31595220
# Returns: number of seconds until expiration
# Example: 39600 = 11 hours remaining

# Check all watchlist keys and their TTLs
KEYS watchlist:* | xargs -I {} sh -c 'echo "Key: {} - TTL: $(redis-cli TTL {})"'

exit
```

---

## 🐛 Troubleshooting

**If cache still shows 30 days:**
```bash
# Check if old code is still running
grep "30 \* 24" src/services/queueProcessor.js
# Should return NO RESULTS (line should be commented or removed)

# Force restart
pm2 delete imdb-worker
pm2 start ecosystem.config.js

# Clear all caches and force re-scrape
redis-cli FLUSHDB
```

**If jobs fail after update:**
```bash
# Check for errors
pm2 logs imdb-worker --err --lines 50

# Verify Redis is running
redis-cli PING
# Expected: PONG

# Check browser/Playwright
pm2 logs imdb-worker | grep -i "playwright\|browser"
```

---

## 📝 Version History

- **v2.8.2** - Changed cache TTL from 30 days to 12 hours
- **v2.8.1** - Fixed React hooks violation in web app
- **v2.8.0** - Added pagination to CatalogPreview
- **v2.5.0** - Fixed 250-item pagination limit (now extracts 400+ items)

---

## 🎯 Success Criteria

- [ ] `git pull` shows "Already up to date" or successful merge
- [ ] Code shows `12 * 60 * 60` in queueProcessor.js
- [ ] `pm2 status` shows "online" for imdb-worker
- [ ] Health endpoint returns `{"status":"healthy"}`
- [ ] Test scrape completes successfully
- [ ] New cache entries expire in 12 hours (check with `TTL` command)

---

## 📞 Support

If you encounter any issues during deployment:

1. Check pm2 logs: `pm2 logs imdb-worker --lines 100`
2. Verify Redis connection: `redis-cli PING`
3. Check browser installation: `npx playwright install`
4. Review GitHub commit: https://github.com/ATG1209/IMDb-to-Stremio/commit/7e2d6e1

---

**Deployment Completed By:** _____________
**Date:** _____________
**Status:** ⬜ Success ⬜ Failed (add notes below)

**Notes:**
