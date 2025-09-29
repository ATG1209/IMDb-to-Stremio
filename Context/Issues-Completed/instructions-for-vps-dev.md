# VPS Developer Instructions - Critical IMDb Worker Enhancement Deployment

## 🚨 **IMMEDIATE ACTION REQUIRED**

The IMDb Stremio addon VPS worker is currently returning **0 items** due to incomplete deployment of enhanced anti-bot stealth features. This document provides step-by-step instructions to resolve the issue and deploy the latest v2.4.0+ enhancements.

## 📊 **CURRENT SITUATION ANALYSIS**

### ❌ **What's Failing**
- **VPS Worker Status**: Running but returning 0 items extracted
- **Version Mismatch**: VPS showing v2.3.4, but enhanced v2.4.0+ features available
- **Stealth Bypass**: Current anti-bot measures insufficient against IMDb's enhanced blocking
- **Test Results**: `curl` tests return `{"success":false,"error":"No items extracted","totalItems":0}`

### ✅ **What's Working**
- **VPS Server**: Operational on port 3003, responding to health checks
- **Enhanced Code**: Advanced stealth features committed and ready in repository
- **Infrastructure**: Redis, authentication, and API endpoints functional

### 🔍 **Root Cause**
1. **Outdated Code**: VPS hasn't pulled latest enhanced stealth features from repository
2. **IMDb Blocking**: Current stealth measures insufficient against new anti-bot protection
3. **Test User**: Using placeholder `ur31595220` instead of real IMDb user ID

## 🛡️ **ENHANCED STEALTH FEATURES READY FOR DEPLOYMENT**

The following advanced anti-detection features have been developed and are waiting in the repository:

### **1. Canvas Fingerprinting Randomization**
```javascript
// Subtle pixel manipulation to defeat canvas-based bot detection
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function(type, attributes) {
  if (type === '2d') {
    const context = getContext.call(this, type, attributes);
    // Add randomization to canvas data
    for (let i = 0; i < result.data.length; i += 4) {
      if (Math.random() < 0.001) {
        result.data[i] = (result.data[i] + Math.floor(Math.random() * 3) - 1) % 256;
      }
    }
  }
}
```

### **2. WebGL Fingerprinting Bypass**
```javascript
// Spoofs WebGL vendor and renderer information
const webglVendors = ['Intel Inc.', 'AMD', 'NVIDIA Corporation', 'Microsoft Corporation'];
const webglRenderers = [
  'Intel Iris OpenGL Engine',
  'Intel(R) UHD Graphics 630',
  'AMD Radeon Pro 555 OpenGL Engine',
  'NVIDIA GeForce GTX 1060'
];
```

### **3. Performance Timing Masking**
```javascript
// Prevents timing-based bot detection
if (window.performance && window.performance.timing) {
  const originalTiming = window.performance.timing;
  Object.defineProperty(window.performance, 'timing', {
    get: function() {
      const maskedTiming = {};
      Object.keys(originalTiming).forEach(key => {
        maskedTiming[key] = originalTiming[key] + Math.floor(Math.random() * 50);
      });
      return maskedTiming;
    }
  });
}
```

### **4. Automation Detection Removal**
```javascript
// Removes playwright and webdriver indicators
delete window.playwright;
delete window.__playwright;
delete navigator.webdriver;
Object.defineProperty(navigator, 'webdriver', { get: () => false });
```

### **5. Enhanced Browser Fingerprinting**
- Extended User-Agent pool (50+ realistic variants)
- Hardware fingerprint randomization
- Screen properties spoofing
- Plugin array manipulation
- Timezone and locale randomization

## 📋 **STEP-BY-STEP DEPLOYMENT INSTRUCTIONS**

### **STEP 1: Pull Latest Enhanced Code**
```bash
# Navigate to IMDb project directory
cd /path/to/IMDb-to-Stremio

# Fetch latest changes from repository
git fetch origin

# Check current branch and status
git status
git branch -v

# Pull latest enhanced stealth features
git pull origin scraper

# Verify the enhanced stealth features are present
cat scraper-worker/src/services/imdbScraper.js | grep -A 5 "Canvas fingerprinting"
```

**Expected Output**: Should show canvas fingerprinting code and enhanced stealth functions

### **STEP 2: Install Dependencies**
```bash
# Navigate to scraper worker directory
cd scraper-worker

# Install any new dependencies
npm install

# Verify package installation
npm list --depth=0
```

### **STEP 3: Verify Environment Configuration**
```bash
# Check environment variables are set
echo "PORT: $PORT"
echo "WORKER_SECRET: ${WORKER_SECRET:0:10}..." # Show first 10 chars only
echo "REDIS_URL: ${UPSTASH_REDIS_URL:0:20}..." # Show first 20 chars only
echo "TMDB_API_KEY: ${TMDB_API_KEY:0:10}..."
echo "PROXY_LIST: ${RESIDENTIAL_PROXY_LIST:0:30}..."

# Verify directories exist
ls -la /var/imdb-session 2>/dev/null || echo "Session dir missing"
ls -la /var/imdb-debug 2>/dev/null || echo "Debug dir missing"
```

**Required Environment Variables:**
```bash
export PORT=3003
export WORKER_SECRET="<your-worker-secret>"
export UPSTASH_REDIS_URL="<your-redis-url>"
export TMDB_API_KEY="<your-tmdb-key>"
export RESIDENTIAL_PROXY_LIST="user:pass@proxy1:port,user:pass@proxy2:port"
export SCRAPER_SESSION_DIR="/var/imdb-session"
export SCRAPER_DEBUG_DIR="/var/imdb-debug"
export SCRAPER_MAX_ATTEMPTS=4
export SCRAPER_MIN_ITEMS_THRESHOLD=5
export SCRAPER_KEEP_BROWSER=0
export LOG_LEVEL=debug
```

### **STEP 4: Create Required Directories**
```bash
# Create session and debug directories with proper permissions
sudo mkdir -p /var/imdb-session /var/imdb-debug
sudo chown $(whoami):$(whoami) /var/imdb-session /var/imdb-debug
chmod 755 /var/imdb-session /var/imdb-debug

# Verify directories are accessible
touch /var/imdb-session/test.txt && rm /var/imdb-session/test.txt
touch /var/imdb-debug/test.txt && rm /var/imdb-debug/test.txt
```

### **STEP 5: Stop Existing Worker Process**
```bash
# Find and kill existing worker processes
ps aux | grep -E "(node|npm).*scraper-worker" | grep -v grep

# Kill existing processes (replace PID with actual process ID)
pkill -f "node.*scraper-worker" || echo "No existing worker found"
pkill -f "npm.*dev.*scraper" || echo "No existing npm process found"

# Verify no processes running on port 3003
lsof -i :3003 || echo "Port 3003 is free"
```

### **STEP 6: Start Enhanced Worker Service**
```bash
# Navigate to scraper worker directory
cd /path/to/IMDb-to-Stremio/scraper-worker

# Start the enhanced worker with all environment variables
npm run dev

# Alternative: Use nohup for background operation
# nohup npm run dev > worker.log 2>&1 &
```

**Expected Startup Output:**
```
🚀 IMDb Scraper Worker v2.4.0+ starting...
✅ Redis connection established
✅ TMDB API key configured
✅ Residential proxies loaded: X proxies
✅ Session directory: /var/imdb-session
✅ Debug directory: /var/imdb-debug
🛡️ Enhanced stealth features activated
🌐 Server listening on port 3003
```

### **STEP 7: Verify Enhanced Features Are Active**
```bash
# Check worker health
curl -s http://localhost:3003/health | jq

# Verify enhanced stealth features in logs
tail -f scraper-worker/worker.log | grep -E "(stealth|canvas|webgl|fingerprint)"

# Check version information
curl -s http://localhost:3003/health | jq '.version'
```

**Expected Health Response:**
```json
{
  "status": "ok",
  "version": "2.4.0+",
  "redis": "connected",
  "stealth": "enhanced",
  "timestamp": "2025-09-28T07:30:00.000Z"
}
```

### **STEP 8: Test with Real IMDb User ID**
```bash
# Test with actual IMDb user ID (NOT ur31595220 which is a placeholder)
# Replace 'ur12345678' with a real IMDb user ID that has a populated watchlist

curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -d '{
    "imdbUserId": "ur12345678",
    "forceRefresh": true
  }' \
  --max-time 180

# Monitor extraction progress in logs
tail -f scraper-worker/worker.log
```

**Expected Success Output:**
```json
{
  "success": true,
  "totalItems": 250,
  "lastUpdated": "2025-09-28T07:35:00.000Z",
  "source": "vps-worker",
  "stealthProfile": "enhanced",
  "extractionTime": "45s",
  "tmdbEnhancement": "248/250 posters found"
}
```

### **STEP 9: Monitor Extraction Process**
```bash
# Watch real-time logs for stealth and extraction indicators
tail -f scraper-worker/worker.log | grep -E "(stealth|proxy|extraction|items|blocked|success)"

# Check session persistence
ls -la /var/imdb-session/

# Check debug captures (only created when blocking detected)
ls -la /var/imdb-debug/
```

**Look for these SUCCESS indicators:**
- ✅ `Stealth profile activated with enhanced fingerprinting`
- ✅ `Proxy rotation: Using proxy X of Y`
- ✅ `Session warmed up successfully`
- ✅ `Navigation successful for page-X`
- ✅ `Extracted X items from page-Y`
- ✅ `TMDB enhancement: X/Y posters found`
- ✅ `FINAL RESULTS: X total items extracted`

**Watch for these FAILURE indicators:**
- ❌ `Access denied on page-X`
- ❌ `Blocked response detected`
- ❌ `Grid view also blocked`
- ❌ `FINAL RESULTS: 0 total items extracted`

### **STEP 10: Validate Production Integration**
```bash
# Test the complete production flow
curl -s "https://imdb-migrator.vercel.app/api/stremio/ur12345678/catalog/movie/imdb-movies-ur12345678?v=2.4.0&refresh=1" | jq '.metas | length'

# Should return 200+ instead of 0
```

## 🔧 **TROUBLESHOOTING GUIDE**

### **Problem 1: Still Getting 0 Items**
```bash
# Check if enhanced code was actually pulled
git log --oneline -5 | grep -i "stealth\|enhanced"

# Should show recent commit with enhanced stealth features
# If not visible, force pull:
git fetch origin && git reset --hard origin/scraper
```

### **Problem 2: Worker Won't Start**
```bash
# Check port conflicts
lsof -i :3003

# Check environment variables
printenv | grep -E "(WORKER_SECRET|REDIS_URL|TMDB_API)"

# Check Node.js and npm versions
node --version  # Should be >= 16
npm --version
```

### **Problem 3: Redis Connection Issues**
```bash
# Test Redis connectivity
redis-cli -u "$UPSTASH_REDIS_URL" ping

# If fails, verify REDIS_URL format:
# redis://user:pass@host:port or rediss://user:pass@host:port
```

### **Problem 4: Proxy Issues**
```bash
# Verify proxy format in RESIDENTIAL_PROXY_LIST
echo "$RESIDENTIAL_PROXY_LIST" | tr ',' '\n' | head -5

# Format should be: user:pass@host:port or http://user:pass@host:port
```

### **Problem 5: Still Showing v2.3.4**
```bash
# Force clean reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## 🚨 **CRITICAL SUCCESS CRITERIA**

### **Deployment is SUCCESSFUL when:**
1. ✅ Worker health check shows status "ok" and version "2.4.0+"
2. ✅ Enhanced stealth features visible in startup logs
3. ✅ Test with real IMDb user ID returns 200+ items
4. ✅ Extraction time under 60 seconds
5. ✅ TMDB poster enhancement 90%+ success rate
6. ✅ No "blocked" or "access denied" messages in logs

### **Deployment FAILED if:**
1. ❌ Health check returns error or shows old version
2. ❌ Test extraction returns 0 items
3. ❌ Logs show "access denied" or "blocked" messages
4. ❌ Worker crashes or fails to start
5. ❌ No enhanced stealth features in logs

## 📞 **POST-DEPLOYMENT VERIFICATION CHECKLIST**

```bash
# Run this complete verification script:

echo "=== VPS Worker Deployment Verification ==="

# 1. Check service status
echo "1. Worker Health Check:"
curl -s http://localhost:3003/health | jq

# 2. Verify enhanced features
echo "2. Enhanced Stealth Features:"
grep -A 3 "Canvas fingerprinting" scraper-worker/src/services/imdbScraper.js

# 3. Test extraction with real user
echo "3. Test Extraction (replace ur12345678 with real IMDb user):"
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -d '{"imdbUserId": "ur12345678", "forceRefresh": true}' \
  --max-time 180 | jq

# 4. Check logs for success indicators
echo "4. Recent Success Indicators:"
tail -50 scraper-worker/worker.log | grep -E "(success|extracted|items)" | tail -5

echo "=== Verification Complete ==="
```

## 📈 **EXPECTED PERFORMANCE METRICS**

### **Target Performance (Enhanced v2.4.0+)**
- **Extraction Success Rate**: 95%+ (vs current 0%)
- **Items Extracted**: 200-500+ items per user
- **Extraction Time**: 30-60 seconds
- **TMDB Enhancement**: 90%+ poster success
- **Stealth Effectiveness**: Zero blocking responses
- **Memory Usage**: <1GB during extraction
- **Proxy Rotation**: Automatic failover across residential IPs

### **Performance Monitoring**
```bash
# Monitor resource usage during extraction
top -p $(pgrep -f "node.*scraper-worker")

# Track extraction metrics
tail -f scraper-worker/worker.log | grep -E "(FINAL RESULTS|total items|extraction time)"

# Monitor proxy rotation
tail -f scraper-worker/worker.log | grep -E "(proxy|rotation|IP)"
```

## 🔄 **MAINTENANCE AND MONITORING**

### **Daily Monitoring**
```bash
# Check worker is running
ps aux | grep -E "node.*scraper-worker" | grep -v grep

# Verify recent successful extractions
tail -100 scraper-worker/worker.log | grep "FINAL RESULTS" | tail -5

# Check proxy health
curl -s http://localhost:3003/health | jq '.proxies'
```

### **Weekly Maintenance**
```bash
# Update to latest stealth enhancements
cd /path/to/IMDb-to-Stremio && git pull origin scraper

# Clear old debug files (if any)
find /var/imdb-debug -name "*.png" -mtime +7 -delete
find /var/imdb-debug -name "*.html" -mtime +7 -delete

# Restart worker for fresh session state
pkill -f "node.*scraper-worker" && npm run dev
```

## 📋 **DEPLOYMENT COMPLETION REPORT**

After completing deployment, provide this status report:

```
=== VPS DEPLOYMENT STATUS REPORT ===

✅ Enhanced stealth features deployed: [YES/NO]
✅ Worker health check passing: [YES/NO]
✅ Version showing 2.4.0+: [YES/NO]
✅ Test extraction successful: [XXX items extracted]
✅ No blocking detected: [YES/NO]
✅ TMDB enhancement working: [XX% success rate]
✅ Proxy rotation active: [YES/NO]

Total deployment time: [XX minutes]
First successful extraction: [XXX items in XX seconds]
Ready for production traffic: [YES/NO]

=== END REPORT ===
```

## 🚀 **FINAL NOTES**

- **Critical**: Use real IMDb user ID for testing, not ur31595220 placeholder
- **Monitor**: Watch logs for "enhanced stealth" activation messages
- **Performance**: Expect 200+ items in under 60 seconds when working properly
- **Blocking**: If still getting blocked, residential proxy list may need refresh
- **Support**: All enhanced stealth features are in the repository and ready to deploy

The enhanced v2.4.0+ stealth features represent a significant advancement in anti-bot detection evasion. Proper deployment should resolve the current 0-items issue and restore full functionality to the IMDb Stremio addon.

---

**Document Version**: v2.4.0+
**Last Updated**: 2025-09-28
**Deployment Priority**: CRITICAL - IMMEDIATE ACTION REQUIRED
**Expected Outcome**: 200+ items extracted successfully with enhanced stealth bypass