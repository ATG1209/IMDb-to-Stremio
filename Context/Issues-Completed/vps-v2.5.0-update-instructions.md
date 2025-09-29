# VPS v2.5.0 Update Instructions - 411 Items Extraction

## 🚨 CRITICAL VPS UPDATE REQUIRED

**Current Issue**: Production Stremio addon showing "EmptyContent" because VPS worker needs latest enhanced code.

**Expected Result**: VPS worker extracts **411 items** instead of current 250-item limit.

## 🔧 VPS Update Commands

### 1. Pull Latest Enhanced Code
```bash
cd /path/to/imdb-scraper-worker
git pull origin main
```

### 2. Verify Version Update
```bash
grep -r "2.5.0" .
# Should show version 2.5.0 in multiple files
```

### 3. Critical Pagination Fix
**Location**: `scraper-worker/src/services/imdbScraper.js`
**Action**: Ensure lines 589-591 are REMOVED/COMMENTED:

```javascript
// ❌ REMOVE/COMMENT THESE LINES:
// if (allItems.length >= 250) {
//   break;  // This prevents page 2 extraction!
// }
```

### 4. Restart VPS Worker Service
```bash
# Stop current worker
pm2 stop imdb-worker
# Or: pkill -f "node.*imdb"

# Start enhanced worker
pm2 start ecosystem.config.js
# Or restart existing: pm2 restart imdb-worker
```

### 5. Verify VPS Worker Health
```bash
# Check worker logs
pm2 logs imdb-worker --lines 50

# Test worker endpoint
curl -X POST "http://localhost:3000/jobs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $WORKER_SECRET" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'
```

## 🎯 Success Criteria

After VPS update, the worker should:

- ✅ **Extract 411 items** (was 250)
- ✅ **Process 2 pages**: page-1-newest + page-2-newest
- ✅ **Content breakdown**: ~335 movies, ~76 TV series
- ✅ **TMDB integration**: Batch processing for posters
- ✅ **Enhanced stealth**: Canvas/WebGL fingerprinting active

## 🔍 Verification Steps

### 1. Check Worker Logs
```bash
pm2 logs imdb-worker | grep -E "(items|extraction|page-2)"
```

**Expected output**:
```
page-1-newest: Found 250 items
page-2-newest: Found 161 items
SINGLE PAGE COMPLETE: Found 411 total unique items
Content breakdown: 335 movies, 76 TV series
```

### 2. Test Production Endpoint
```bash
curl -s "https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220.json?refresh=1" | jq '.metas | length'
```

**Expected result**: `411` (not `0`)

### 3. Verify Stremio Addon
- **URL**: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=2.5.0`
- **Expected**: 411 movies with posters instead of "EmptyContent"

## 🚀 v2.5.0 Enhanced Features

### Advanced Stealth Technology
- **Canvas Fingerprinting Randomization**: Prevents IMDb detection
- **WebGL Fingerprinting Bypass**: Spoofs GPU vendor/renderer
- **Performance Timing Masking**: Prevents profiling
- **Automation Detection Removal**: Removes playwright/webdriver signals

### Multi-Page Extraction
- **Page 1**: `sort=created:desc&view=detail` (250 items)
- **Page 2**: `sort=created:desc&view=detail&page=2` (161 items)
- **Total**: 411 items with proper deduplication

### Enhanced Browser Configuration
- **Residential Proxy Support**: Session persistence per proxy
- **Advanced Launch Flags**: Optimized for stealth operation
- **Human-like Behavior**: Mouse movements, scrolling patterns

## 🛠️ Troubleshooting

### If Worker Still Returns 0 Items:
1. Check IMDb blocking with manual test:
   ```bash
   curl -H "User-Agent: Mozilla/5.0..." "https://www.imdb.com/user/ur31595220/watchlist"
   ```

2. Verify proxy configuration:
   ```bash
   echo $RESIDENTIAL_PROXY_LIST
   ```

3. Check browser launch logs:
   ```bash
   pm2 logs imdb-worker | grep -E "(browser|playwright|launch)"
   ```

### If Still Extracting Only 250 Items:
1. Verify pagination fix applied:
   ```bash
   grep -A5 -B5 "allItems.length >= 250" scraper-worker/src/services/imdbScraper.js
   # Should show NO RESULTS or commented lines
   ```

2. Check page-2 processing:
   ```bash
   pm2 logs imdb-worker | grep "page-2-newest"
   ```

## 📞 Support

If issues persist after VPS update:
1. Share worker logs: `pm2 logs imdb-worker --lines 100`
2. Confirm version: `grep "2.5.0" lib/version.ts`
3. Test endpoint manually and share response

---

**Expected Timeline**: 5-10 minutes for complete update and verification.
**Critical Success Metric**: Production Stremio addon shows 411 movies instead of "EmptyContent".