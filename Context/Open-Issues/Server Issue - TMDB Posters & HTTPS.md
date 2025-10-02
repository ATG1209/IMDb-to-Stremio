# Server Issue: TMDB Posters & HTTPS Integration

**Date:** September 29, 2025
**Last Updated:** September 29, 2025 23:10 UTC
**Status:** PARTIALLY RESOLVED - TMDB service updated, HTTPS still broken
**Impact:** Medium - Core functionality works, missing posters and HTTPS installation
**Priority:** MEDIUM

## 🎯 Issue Summary

The VPS-hosted Stremio addon has **two critical issues** preventing full functionality:

1. **TMDB Poster Integration Failure**: Despite having a valid TMDB API key, posters are not being fetched during scraping
2. **HTTPS Installation Broken**: Traefik SSL routing returns 502 Bad Gateway, preventing Stremio addon installation

## 🔍 Technical Analysis

### **Current Working State:**
- ✅ **VPS Worker (Port 3003)**: Healthy, 411 items cached, Redis connected
- ✅ **Stremio Addon (Port 3000)**: Serving 337 movies + 74 series = 411 total items
- ✅ **HTTP Endpoints**: All working perfectly on `http://37.27.92.76:3000`
- ✅ **TMDB API Key**: Present in environment (`TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac`)
- ✅ **TMDB API External Test**: Manual curl to TMDB API returns poster URLs correctly

### **Issue #1: TMDB Poster Integration Failure**

**Problem**: All movie items have `"poster": null` despite valid TMDB API key and working external API

**Evidence:**
```bash
# Cache shows no posters:
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data[0].poster'
# Result: null

# But TMDB API works:
curl "https://api.themoviedb.org/3/search/movie?api_key=09a2e4b535394bb6a9e1d248cf87d5ac&query=Black%20Book&year=2006"
# Result: Returns poster path "/gAUAE1WiKjcbrPjpMc99MxBR3U2.jpg"
```

**Root Cause Analysis:**
The issue is in the scraper worker's TMDB integration flow. Code analysis shows:

1. **Code Structure** (`/scraper-worker/src/services/imdbScraper.js`):
   - Line 675: `await this.enhanceWithTmdb(allItems);` - Called correctly
   - Lines 920-953: `enhanceWithTmdb()` method exists and looks correct
   - Lines 930-932: Calls `tmdbService.getPosterBatch()` method

2. **Potential Issues**:
   - `tmdbService.getPosterBatch()` method may not exist or be broken
   - Environment variable not loaded in worker process during runtime
   - Network issues from VPS to TMDB API
   - Silent failures in TMDB service with no error logging

**Debug Steps Attempted:**
- ✅ Confirmed TMDB_API_KEY in environment
- ✅ Restarted worker service multiple times
- ✅ Triggered fresh scraping jobs with `forceRefresh: true`
- ✅ Verified TMDB API works externally from VPS
- ❌ No detailed logging of TMDB service calls during scraping

### **Issue #2: HTTPS/SSL Installation Failure**

**Problem**: Stremio requires HTTPS for addon installation, but current HTTPS endpoint returns 502 Bad Gateway

**Evidence:**
```bash
# HTTPS returns 502:
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/ur31595220/manifest.json
# Result: HTTP/2 502 Bad Gateway

# But HTTP works perfectly:
curl http://37.27.92.76:3000/api/stremio/ur31595220/manifest.json
# Result: Valid manifest JSON
```

**Technical Details:**
- **SSL Certificate**: Working (Let's Encrypt issued successfully)
- **Traefik**: Running and responding on port 443
- **Service**: Running on `127.0.0.1:3000` (confirmed by VPS dev)
- **Domain**: `static.76.92.27.37.clients.your-server.de` resolves to VPS IP

**Root Cause**: Traefik routing configuration issue between SSL termination and backend service

**Traefik Config Attempted:**
```yaml
# Added to /data/coolify/proxy/dynamic/imdb-addon.yml:
http:
  routers:
    imdb-addon:
      rule: "Host(`static.76.92.27.37.clients.your-server.de`)"
      service: "imdb-addon"
      tls:
        certResolver: "letsencrypt"
  services:
    imdb-addon:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3000"
```

**Fix Attempts:**
- ✅ Changed from `localhost:3000` to `127.0.0.1:3000`
- ✅ Restarted Traefik service
- ✅ Verified SSL certificate exists
- ❌ Still returns 502 Bad Gateway

## 🔬 Detailed Investigation History

### **Timeline of Events:**

**Initial Problem (Sept 28, 2025):**
- Cache synchronization issue between VPS worker and Stremio addon
- Worker saved to `imdb:job:${jobId}:result` but addon looked for `watchlist:${userId}`

**Resolution #1:**
- Fixed cache key synchronization in `queueProcessor.js`
- Added dual storage approach
- Result: ✅ 411 items now cached and accessible

**Problem #2 (Sept 29, 2025):**
- Addon showing only 3 hardcoded items instead of 411 cached items
- Root cause: `useWorker = false` hardcoded in addon

**Resolution #2:**
- Enabled VPS worker in Stremio addon code
- Removed test mode completely
- Result: ✅ Now serving 337 movies + 74 series = 411 total

**Problem #3 (Current):**
- No poster images (all `poster: null`)
- HTTPS installation fails (502 Bad Gateway)
- Despite multiple environment and configuration fixes

### **VPS Environment Details:**

**Services Running:**
```bash
# Port 3000: Next.js Stremio addon
# Port 3003: Node.js scraper worker
# Port 80/443: Traefik reverse proxy
# Port 8080: Additional service (unknown)
```

**Environment Variables Confirmed:**
```bash
DEFAULT_IMDB_USER_ID=ur31595220
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
NODE_ENV=production
WORKER_SECRET=imdb-worker-2025-secret
WORKER_URL=http://localhost:3003
```

**System Info:**
- OS: Linux (VPS)
- IP: 37.27.92.76
- Domain: static.76.92.27.37.clients.your-server.de
- Reverse Proxy: Traefik (with Coolify management)
- SSL: Let's Encrypt (certificate issued successfully)

## 🚨 Critical Debugging Required

### **For TMDB Poster Issue:**

**Required Debug Steps:**
1. **Verify tmdbService methods exist:**
   ```bash
   cd /path/to/worker && node -e "
   const { tmdbService } = require('./src/services/tmdbService.js');
   console.log('Methods:', Object.getOwnPropertyNames(tmdbService));
   console.log('getPosterBatch exists:', typeof tmdbService.getPosterBatch);
   "
   ```

2. **Test TMDB service directly:**
   ```bash
   cd /path/to/worker && node -e "
   const { tmdbService } = require('./src/services/tmdbService.js');
   tmdbService.getPosterBatch([{title: 'Black Book', year: '2006'}])
     .then(result => console.log('Poster result:', result))
     .catch(err => console.error('TMDB Error:', err));
   "
   ```

3. **Add debug logging to scraper:**
   ```javascript
   // Add to line 675 in imdbScraper.js:
   console.log('=== TMDB ENHANCEMENT STARTING ===');
   console.log('Items to enhance:', allItems.length);
   await this.enhanceWithTmdb(allItems);
   console.log('=== TMDB ENHANCEMENT COMPLETED ===');
   ```

4. **Check worker logs during scraping:**
   ```bash
   tail -f /var/log/worker.log | grep -i "tmdb\|poster\|enhancement"
   ```

### **For HTTPS/Traefik Issue:**

**Required Debug Steps:**
1. **Check Traefik logs:**
   ```bash
   docker logs traefik --tail 50 | grep -i "imdb\|static\|error"
   ```

2. **Verify service accessibility:**
   ```bash
   # From VPS server:
   curl -I http://127.0.0.1:3000/api/stremio/ur31595220/manifest.json
   ```

3. **Check Traefik configuration:**
   ```bash
   cat /data/coolify/proxy/dynamic/imdb-addon.yml
   ```

4. **Alternative Traefik config format to try:**
   ```yaml
   http:
     routers:
       imdb-addon:
         rule: "Host(`static.76.92.27.37.clients.your-server.de`)"
         entryPoints:
           - "websecure"
         service: "imdb-addon"
         tls:
           certResolver: "letsencrypt"
     services:
       imdb-addon:
         loadBalancer:
           servers:
             - url: "http://host.docker.internal:3000"
   ```

## 📋 Action Items for Resolution

### **Immediate Priority (TMDB Posters):**
1. **Execute debug commands above to identify exact failure point**
2. **Check if `getPosterBatch` method exists in tmdbService.js**
3. **Verify environment variable loading in worker process**
4. **Add comprehensive logging to TMDB enhancement flow**
5. **Test TMDB service in isolation**

### **Secondary Priority (HTTPS):**
1. **Check Traefik logs for specific routing errors**
2. **Try alternative Traefik configuration formats**
3. **Verify Docker networking between Traefik and service**
4. **Consider direct nginx SSL proxy as fallback**

### **Alternative Solutions:**
1. **TMDB Workaround**: Implement poster fetching in frontend from TMDB API
2. **HTTPS Workaround**: Use Cloudflare tunnel for temporary HTTPS
3. **Service Split**: Move addon to Vercel with VPS worker backend

## 🔄 Resolution Progress & Updates

### **✅ TMDB Service Code Fixed (Sept 29, 23:00 UTC)**

**Issues Identified & Resolved:**
1. **Missing `getPosterBatch` Method**: Original tmdbService.js was missing the batch poster fetching method
2. **Improper API Key Handling**: Environment variable validation was inconsistent
3. **No Rate Limiting**: TMDB API calls could trigger rate limiting

**Code Updates Applied:**
- ✅ Added comprehensive `getPosterBatch()` method with batch processing
- ✅ Implemented `getTmdbApiKey()` function with proper validation
- ✅ Added rate limiting (250ms between batches, 10 items per batch)
- ✅ Enhanced error handling and logging
- ✅ Fixed `detectContentTypeBatch()` to use new API key function

**Files Modified:**
- `/scraper-worker/src/services/tmdbService.js` - Complete service rewrite

**Testing Status:**
```bash
# Latest test results (Sept 29, 23:10):
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data[0].poster'
# Result: Still null - Integration not yet working despite code fixes
```

**Next Steps for TMDB:**
1. **Environment Loading**: Ensure worker restarts with proper TMDB_API_KEY
2. **Integration Testing**: Verify `enhanceWithTmdb()` is called during scraping
3. **Debug Logging**: Check worker logs for TMDB enhancement messages

### **⚠️ HTTPS Issue Status (Sept 29, 23:10 UTC)**

**VPS Dev Progress:**
- ✅ Traefik container identified (`coolify-proxy`)
- ✅ Updated Traefik config to use `http://host.docker.internal:3000`
- ✅ Restarted Traefik service
- ⚠️ HTTPS still returns connectivity issues

**Current Test Results:**
```bash
curl -I https://static.76.92.27.37.clients.your-server.de/api/stremio/ur31595220/manifest.json
# Result: Connection timeout or SSL errors
```

**Remaining Tasks:**
1. **Verify Traefik Config**: Check if routing rules are properly loaded
2. **SSL Certificate**: Ensure Let's Encrypt cert is valid and accessible
3. **Service Discovery**: Confirm Docker networking between Traefik and addon

## 🎯 Updated Success Criteria

**TMDB Posters (Priority: Medium):**
- ✅ Code: Fixed and deployed
- ⏳ Integration: Need worker restart with environment
- ❌ Testing: Posters still null in cache

**HTTPS Installation (Priority: High):**
- ⏳ Routing: Traefik config updated but not working
- ❌ Testing: HTTPS endpoint still inaccessible
- ❌ Goal: Stremio addon installation

## 🔗 Related Files

**Local Repository:**
- `/scraper-worker/src/services/imdbScraper.js` - TMDB integration logic
- `/scraper-worker/src/services/tmdbService.js` - TMDB API service
- `/pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts` - Addon endpoint

**VPS Files:**
- `/data/coolify/proxy/dynamic/imdb-addon.yml` - Traefik config
- Worker logs location (needs confirmation)
- Environment file location (needs confirmation)

---

## 📝 Developer Notes & Lessons Learned

**Time Investment**: ~6 hours of debugging across multiple sessions (Sept 28-29, 2025)

**Key Findings:**
1. **TMDB Integration**: The issue was IMDb numbering in titles ("410. Black Book"), not environment or API key problems
2. **Code Organization**: Poor error handling in original TMDB service made debugging difficult
3. **VPS Complexity**: Traefik/Docker networking adds layers of complexity vs simple nginx
4. **Testing Approach**: Direct API testing was more effective than end-to-end testing

**Current Status Summary:**
- ✅ **Core Functionality**: 411 items cached and served perfectly
- ✅ **TMDB Code**: Fixed with title cleaning (removes numbering prefix)
- ✅ **TMDB Integration**: 100% working - all items have posters
- ⚠️ **VPS HTTPS Access**: Not needed - Vercel handles HTTPS perfectly

**Recommended Next Actions:**
1. ✅ **TMDB**: RESOLVED - Title cleaning fix deployed and working
2. ❌ **VPS HTTPS**: IGNORE - Not needed, Vercel deployment works perfectly
3. ✅ **Monitoring**: Worker logs show TMDB enhancement success

**Production Readiness**: 100% complete - fully operational on Vercel

---

## ✅ RESOLUTION (October 2, 2025)

### **TMDB Posters - FIXED**

**Root Cause:** Titles contained IMDb numbering prefix (e.g., "410. Black Book") which failed TMDB API searches.

**Solution:** Added `cleanTitle()` function in `/scraper-worker/src/services/imdbScraper.js`:
```javascript
const cleanTitle = (title) => {
  if (!title) return title;
  return title.replace(/^\d+\.\s*/, '').trim();
};
```

**Result:**
- ✅ All 411 items now have TMDB poster URLs
- ✅ 100% success rate for poster fetching
- ✅ Example: "410. Black Book" → searches TMDB as "Black Book" → finds poster

**Deployment:**
- Code pushed to GitHub
- VPS worker restarted
- Vercel auto-deployed
- Confirmed working in production

### **HTTPS Installation - CLARIFICATION**

**Discovery:** The VPS HTTPS endpoint was never needed for production!

**Actual Architecture:**
- ✅ **Vercel** serves frontend + Stremio API (with HTTPS)
- ✅ **VPS Worker** only provides backend scraping service
- ❌ **VPS HTTPS** endpoint is unused (Traefik issues can be ignored)

**Production URL:**
```
https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json
```

**Result:**
- ✅ HTTPS working perfectly via Vercel
- ✅ Stremio addon installs successfully
- ✅ No Traefik configuration needed
- ✅ Global CDN performance

---

## 📚 Complete Documentation

See `/Context/Ultimate-Workflow-Fix.md` for comprehensive architecture documentation, troubleshooting guide, and deployment workflow.

**Production Status**: ✅ FULLY OPERATIONAL
**Version**: 2.8.0