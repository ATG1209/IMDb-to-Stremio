# Server Issue: TMDB Posters & HTTPS Integration

**Date:** September 29, 2025
**Status:** UNRESOLVED - Multiple attempts failed
**Impact:** Critical - No posters in Stremio addon, HTTPS installation broken
**Priority:** HIGH

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

## 🎯 Expected Resolution Time

**Based on issue complexity:**
- **TMDB Issue**: 1-2 hours of focused debugging
- **HTTPS Issue**: 30 minutes to 2 hours depending on Traefik expertise

**Success Criteria:**
- ✅ Posters appear in cache: `curl cache/ur31595220 | jq '.data[0].poster'` returns URL
- ✅ HTTPS works: `curl https://domain/manifest.json` returns 200 OK
- ✅ Stremio installation: Addon installs successfully with HTTPS URL

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

**Developer Note**: This issue has consumed significant debugging time with multiple failed attempts. The core functionality works perfectly (411 items cached and served), but these two issues prevent production readiness. Focus debugging efforts on the specific areas identified above rather than broad troubleshooting.