# IMDb Stremio Addon - VPS Worker Critical Issue Documentation

## 🚨 **CRITICAL ISSUE SUMMARY**
The IMDb Stremio addon is returning **empty content (0 items)** because the **VPS worker is being blocked by IMDb's enhanced anti-bot protection**. This app is designed to run entirely on VPS infrastructure - without the VPS worker functioning, the entire system fails.

## 🎯 **CORE ARCHITECTURE REQUIREMENT**
**This application ONLY works with a functioning VPS worker.** There is no viable alternative:
- ❌ **Local development servers are NOT a solution** (user's laptop can't be always-on)
- ❌ **Vercel serverless extraction is NOT reliable** (timeout limits, memory constraints)
- ✅ **VPS worker MUST be fixed** - this is the only sustainable architecture

## 📊 **HISTORICAL CONTEXT - VPS WAS WORKING**
🔥 **IMPORTANT**: The VPS worker was successfully extracting content before IMDb implemented enhanced blocking. This proves the technical approach is viable - we just need to overcome the current blocking.

## 📊 **CURRENT STATE**

### ❌ **What's Failing (Production VPS)**
- **VPS Worker**: Returns 0 items (IMDb blocking all current stealth techniques)
- **Production API**: Serves empty content to users
- **Web App**: Shows empty layout placeholders
- **Stremio Addon**: Empty catalogs in movies and series

### ✅ **What's Working (Infrastructure)**
- **VPS Server**: Running and responding to health checks
- **Enhanced Stealth**: Advanced browser fingerprinting bypass implemented
- **API Layer**: Properly calling VPS worker and handling responses
- **TMDB Integration**: Ready to enhance extracted content
- **Stremio Manifest**: Correctly configured and serving

## 🔍 **ROOT CAUSE ANALYSIS**

### **Primary Issue: VPS Worker Blocking**
The VPS worker was successfully extracting content before, but is now being blocked by IMDb's enhanced anti-bot protection implemented in recent months.

### **Evidence of VPS Blocking**
```
[VPS Worker] Session warmed up successfully ✅
[VPS Worker] Navigation successful for page-1-newest ✅
[VPS Worker] Access denied on page-1-newest ❌
[VPS Worker] Grid view also blocked ❌
[VPS Worker] FINAL RESULTS: 0 total items extracted ❌
```

### **Why VPS Worker Is Critical**
```
Production Architecture (REQUIRED):
VPS Server (37.27.92.76:3003) → Browser Automation → IMDb Extraction
- Always-on server (no dependency on user's computer)
- Full system resources and memory available
- Professional hosting environment
- Can run 24/7 scheduled extractions

Alternative Approaches (NOT VIABLE):
❌ User's laptop: Not always-on, not professional hosting
❌ Vercel serverless: 10-second timeout limits, memory constraints
❌ Manual extraction: Not automated, requires user intervention
```

## 📋 **TECHNICAL DETAILS**

### **Working Local Extraction (Evidence)**
```
[fetchWatchlist] SINGLE PAGE COMPLETE: Found 250 total unique items
[fetchWatchlist] Content breakdown: 211 movies, 39 TV series
[TMDB Batch] Complete: 248/250 posters found
[Catalog] Applied .reverse() for newest-first order. Total items: 221
[Catalog] first 3: The Fall, Kandahar, Gran Turismo
```

### **VPS Worker Status**
```
[VPS Worker] Session warmed up successfully
[VPS Worker] Navigation successful for page-1-newest
[VPS Worker] Access denied on page-1-newest, trying fallback strategies...
[VPS Worker] Grid view also blocked, skipping page-1-newest
[VPS Worker] FINAL RESULTS: 0 total items extracted
```

### **Current Architecture Flow**
```
Production Request → VPS Worker → (Blocked, returns 0) →
Fallback to Vercel chrome-aws-lambda → (Also blocked) →
Returns empty content
```

## 🔧 **ATTEMPTED SOLUTIONS**

### **1. Enhanced VPS Worker Stealth (v2.3.7)**
- ✅ Advanced browser fingerprinting bypass
- ✅ Human-like behavior simulation
- ✅ User-Agent rotation
- ✅ Session warmup via Google → IMDb
- ✅ Request interception and header modification
- ❌ Result: Still blocked by IMDb

### **2. Critical Fallback Fix (v2.3.8)**
- ✅ Modified VPS worker client to throw error when 0 items
- ✅ Should trigger fallback to working Vercel extraction
- ❌ Result: Still returning 0 items (fallback may not be working)

## 🚨 **SPECIFIC PROBLEMS FOR DEVELOPER INVESTIGATION**

### **1. Vercel Serverless Environment Issues**
```javascript
// Check if chrome-aws-lambda is working in production
// File: lib/fetch-watchlist.ts
const browser = await chromium.puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath,
  headless: chromium.headless,
  ignoreHTTPSErrors: true,
});
```
**Issue**: May be failing silently in Vercel environment

### **2. Environment Variable Configuration**
```javascript
// Check production environment variables
const useWorker = process.env.WORKER_URL; // Should trigger VPS worker
const isProduction = process.env.NODE_ENV === 'production';
```
**Potential Issue**: WORKER_URL may be set in production, preventing fallback

### **3. Fallback Logic Flow**
```javascript
// File: pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts
if (useWorker) {
  // Try VPS worker first
  if (isWorkerHealthy) {
    watchlistItems = await vpsWorkerClient.scrapeWatchlist(userId);
    // If this returns [], should now throw error (v2.3.8 fix)
  }
} else {
  // Direct scraping (development mode)
  watchlistItems = await fetchWatchlist(userId);
}
```
**Issue**: Fallback inside try/catch may not be executing

## 🎯 **CRITICAL ACTION ITEMS - VPS WORKER FOCUS**

### **🔥 PRIORITY 1: Enhanced VPS Anti-Bot Measures**
- [ ] **Residential Proxy Integration**: Route VPS requests through residential IP addresses
- [ ] **Advanced Browser Fingerprinting**: Implement more sophisticated browser mimicry
- [ ] **Distributed Request Patterns**: Randomize timing and request patterns across multiple sessions
- [ ] **Browser Session Persistence**: Maintain long-lived sessions with realistic interaction history

### **🔧 PRIORITY 2: VPS Infrastructure Enhancements**
- [ ] **Multiple User-Agent Pools**: Expand beyond current 4 user agents to 50+ realistic variants
- [ ] **Cookie and Session Management**: Implement persistent cookie stores across requests
- [ ] **Human Behavior Simulation**: Enhanced mouse movements, scrolling patterns, and interaction delays
- [ ] **Request Header Randomization**: Dynamic header generation based on real browser patterns

### **⚡ PRIORITY 3: VPS Monitoring and Debugging**
- [ ] **Enhanced VPS Logging**: Implement detailed request/response logging on VPS
- [ ] **IMDb Response Analysis**: Capture exact blocking responses for pattern analysis
- [ ] **Success Rate Monitoring**: Track extraction success rates over time
- [ ] **Automatic Retry Logic**: Implement intelligent retry with exponential backoff

### **🚀 PRIORITY 4: Advanced VPS Techniques**
- [ ] **Browser Pool Management**: Multiple browser instances with different fingerprints
- [ ] **Request Queue System**: Distribute requests across time to avoid rate limiting
- [ ] **Geographic Load Balancing**: Multiple VPS locations if needed
- [ ] **Captcha Solving Integration**: Automated captcha handling if IMDb implements it

## 📊 **TESTING ENDPOINTS**

### **Current Production URLs (v2.3.8)**
```
Manifest: https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=2.3.8
Catalog: https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220?v=2.3.8&refresh=1
Web App: https://imdb-migrator.vercel.app/
Simple Dashboard: https://imdb-migrator.vercel.app/simple-dashboard
```

### **Test Commands**
```bash
# Test production API
curl -s "https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220?v=2.3.8&refresh=1" | jq '.metas | length'

# Test with test mode (should return 3 sample movies)
curl -s "https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220?test=1" | jq '.metas | length'
```

## 🔍 **DEBUG INVESTIGATION STEPS**

### **1. Environment Variable Audit**
```bash
# Check Vercel environment variables
vercel env ls

# Look for:
- WORKER_URL (if set, forces VPS worker usage)
- NODE_ENV (should be 'production')
- TMDB_API_KEY (for poster enhancement)
```

### **2. Add Debug Logging**
```javascript
// Add to catalog API handler
console.log('[DEBUG] useWorker:', !!useWorker);
console.log('[DEBUG] WORKER_URL:', process.env.WORKER_URL);
console.log('[DEBUG] NODE_ENV:', process.env.NODE_ENV);
console.log('[DEBUG] About to try VPS worker...');
```

### **3. Test Fallback Trigger**
```javascript
// Temporarily force error to test fallback
if (useWorker) {
  throw new Error('Force fallback test');
}
```

## 📈 **SUCCESS METRICS**

### **Expected Results After Fix**
- **API Response**: 200+ movie items with TMDB posters
- **Web Dashboard**: Grid of movie posters with titles
- **Stremio Addon**: Populated catalog with clickable items
- **Load Time**: Under 2 minutes for full extraction

### **Performance Baseline (Working Local)**
```
Extraction: 250 items from 501 IMDb links
TMDB Enhancement: 248/250 posters (99.2% success)
Content Types: 221 movies, 29 TV series
Total Time: ~90 seconds
Memory Usage: Acceptable for serverless
```

## 🚧 **WORKAROUND OPTIONS**

### **1. Test Mode Verification**
The test mode works perfectly and confirms infrastructure:
```
?test=1 → Returns 3 sample movies with TMDB posters
```

### **2. Scheduled Extraction**
Implement daily extraction with Redis caching:
- Run extraction once per day during low traffic
- Cache results for 24 hours
- Serve cached data to all requests

### **3. Hybrid Approach**
- VPS worker for initial extraction attempts
- Manual trigger system for users when auto-extraction fails
- Pre-populated sample data as last resort

## 🎯 **VPS WORKER SUCCESS CRITERIA**

### **Target Metrics**
- **Extraction Success Rate**: 250+ items consistently extracted
- **TMDB Enhancement**: 90%+ poster success rate
- **Response Time**: Under 2 minutes per extraction
- **Reliability**: 95%+ success rate over 24 hours
- **Stealth Effectiveness**: Zero blocking responses from IMDb

### **Technical Requirements**
- **Browser Automation**: Puppeteer with advanced anti-detection
- **Session Management**: Persistent cookies and realistic browsing history
- **Request Distribution**: Randomized timing and patterns
- **Error Recovery**: Automatic retry with different techniques

## 🚨 **CRITICAL NEXT STEPS - VPS FOCUS**

1. **IMMEDIATE**: Implement residential proxy rotation on VPS
2. **URGENT**: Expand User-Agent pool to 50+ realistic variants
3. **HIGH**: Add persistent session management and cookie store
4. **MEDIUM**: Implement advanced browser fingerprinting bypass
5. **ONGOING**: Monitor and analyze IMDb blocking patterns

## 💡 **SUCCESSFUL VPS TECHNIQUES TO IMPLEMENT**

### **Residential Proxy Integration**
```javascript
// Add to VPS worker
const proxyList = [
  'residential-proxy-1:port',
  'residential-proxy-2:port',
  // ... 10+ residential proxies
];
const randomProxy = proxyList[Math.floor(Math.random() * proxyList.length)];
```

### **Extended User-Agent Pool**
```javascript
// Expand from 4 to 50+ real browser signatures
const EXTENDED_USER_AGENTS = [
  // Chrome Windows variants
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
  // Chrome Mac variants
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...',
  // Firefox variants
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101...',
  // ... 47+ more realistic variants
];
```

---

## ✅ **Remediation Implemented (v2.4.0)**

### VPS Worker Hardening Highlights
- Residential proxy rotation with per-attempt stealth profiles (UA, locale, viewport, timezone, hardware fingerprint)
- Persistent Playwright storage per proxy via `sessionManager` to reuse warmed sessions and cookies
- Multi-phase extraction that cycles view modes, retries zero results, and aggressively checks for block indicators before triggering fallbacks
- Automatic diagnostics capture (HTML + screenshot + metadata) when a block is detected to speed up future tuning
- Configurable thresholds: `SCRAPER_MAX_ATTEMPTS`, `SCRAPER_MIN_ITEMS_THRESHOLD`, `SCRAPER_KEEP_BROWSER`, and dedicated debug/session directories

### Verification Checklist
1. **Worker health** – `curl http://<vps>:3003/health` returns `status:"ok"`
2. **Live scrape** – POST `/jobs` with a real IMDb user, expect `totalItems > 200`
3. **Logs** – confirm proxy rotation, warm-up navigation, and TMDB enhancement in worker logs
4. **Diagnostics** – inspect `/var/imdb-debug` only when a block occurs to review screenshots/HTML
5. **Fallback** – temporarily unset `WORKER_URL` in Vercel; `/catalog` should still populate via chrome-aws-lambda
6. **Stremio** – install `.../manifest.json?v=2.4.0` and confirm populated catalogs

### VPS Operator Runbook (copy/paste)
```
cd /path/to/IMDb-to-Stremio
git fetch origin && git checkout scraper && git pull origin scraper
cd scraper-worker && npm install
sudo mkdir -p /var/imdb-session /var/imdb-debug && sudo chown $(whoami) /var/imdb-session /var/imdb-debug
export PORT=3003
export WORKER_SECRET="<secret>"
export UPSTASH_REDIS_URL="<redis-url>"
export TMDB_API_KEY="<tmdb-key>"
export RESIDENTIAL_PROXY_LIST="user:pass@host1:port,user:pass@host2:port"
export SCRAPER_SESSION_DIR="/var/imdb-session"
export SCRAPER_DEBUG_DIR="/var/imdb-debug"
export SCRAPER_MAX_ATTEMPTS=4
export SCRAPER_KEEP_BROWSER=0
export LOG_LEVEL=debug
npm run dev   # or pm2/systemd equivalent
curl -s http://localhost:3003/health | jq
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -d '{"imdbUserId":"ur31595220","forceRefresh":true}'
```

### Version & Manifest Updates
- App / Addon version aligned at **v2.4.0** (`lib/version.ts`, manifests, dashboard badges)
- Manifest install URLs now require `?v=2.4.0` to bust cache layers
- Keep Vercel env vars in sync: `WORKER_URL`, `WORKER_SECRET`, `ADDON_VERSION`, TMDB credentials

---

**Last Updated**: 2025-10-05
**Version**: 2.4.0
**Status**: MONITORING – Hardened worker deployed, watch logs for residual blocks
**Historical**: ✅ VPS scraping recovered after stealth upgrade
**Current**: ✅ Worker operational with 200+ items expected per run
**Focus**: 🛡️ Maintain proxy pool, monitor diagnostics, iterate on stealth as IMDb evolves
