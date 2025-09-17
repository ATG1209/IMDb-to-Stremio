# IMDb Watchlist Pagination Issue - Technical Analysis

## 🚨 **Critical Issue**: 250-Item Extraction Limit

### **Problem Summary**
- **Expected**: Extract all 501+ items from user's IMDb watchlist
- **Actual**: Only 250 items are extracted and returned to Stremio
- **Impact**: Users missing 50%+ of their watchlist content

---

## 📊 **Current Status** (v1.11.0)

### ✅ **What's Working**
- Browser successfully loads all 501+ items during scrolling
- Page analysis confirms: `"titleLinks": 501, "hasPosterCards": "YES"`
- Aggressive scrolling with breakthrough detection at 250-item boundary
- Multiple DOM extraction methods (.lister-item, .ipc-poster-card, a[href*="/title/"])

### ❌ **What's Broken**
- Extraction phase only yields 250 items despite 501 being found
- Logs consistently show: `Final count: 501 items` → `Found 250 items`
- All extraction methods (lister, ipc, links) appear limited to 250 items

---

## 🔍 **Root Cause Analysis**

### **The 250-Item Barrier**
IMDb implements sophisticated lazy loading and virtual scrolling to prevent browser performance issues:

1. **Virtual Scrolling**: Only ~250 items are fully rendered with complete DOM structure
2. **Progressive Enhancement**: Items 251-501 exist as minimal `<a>` tags without rich metadata
3. **DOM Recycling**: IMDb reuses DOM elements to maintain performance
4. **Memory Optimization**: Prevents browser slowdown by limiting fully-rendered components

### **Evidence from Logs**
```
[fetchWatchlist] Page analysis: { "titleLinks": 501, "hasPosterCards": "YES" }
[fetchWatchlist] Scrolling complete. Final count: 501 items
[fetchWatchlist] Found 250 items for ur31595220
```

**Key Insight**: The problem is in the **extraction phase**, not the scrolling phase.

---

## 🛠 **Technical Investigation**

### **Current Extraction Logic**
```javascript
// 1. Extract from .lister-item (detail view)
const lister = Array.from(document.querySelectorAll('.lister-item'))...

// 2. Extract from .ipc-poster-card (grid view)
const ipc = Array.from(document.querySelectorAll('.ipc-poster-card'))...

// 3. Fallback: Extract from ALL title links
const links = Array.from(document.querySelectorAll('a[href*="/title/"]'))...

// 4. Choose method with most items
let chosen = normalize(lister);
if (normalize(ipc).length > chosen.length) chosen = normalize(ipc);
if (uniqueLinks.length > chosen.length) chosen = normalize(uniqueLinks);
```

### **Suspected Bottlenecks**

1. **Title Filtering**: Extraction may filter out items with empty/minimal titles
2. **IMDb ID Validation**: Items 251-501 may have different href formats
3. **DOM Structure Differences**: Later items may lack poster card structure
4. **Timing Issues**: Extraction may run before all items are fully loaded
5. **Duplicate Filtering**: Deduplication logic may remove valid items

---

## 🎯 **Potential Solutions**

### **Phase 1: Enhanced Diagnostics**
- [ ] Add detailed logging showing counts from each extraction method
- [ ] Log sample items from positions 1-50, 200-250, 400-450
- [ ] Add timing measurements between scrolling and extraction
- [ ] Debug which extraction method is being chosen and why

### **Phase 2: Improved Extraction**
- [ ] **Remove strict filtering**: Accept items with minimal titles
- [ ] **Enhanced IMDb ID extraction**: Handle various href formats
- [ ] **Timing optimization**: Add delay between scrolling completion and extraction
- [ ] **Multiple extraction passes**: Run extraction several times and merge results

### **Phase 3: Alternative Strategies**
- [ ] **Incremental extraction**: Extract every 100 items during scrolling
- [ ] **DOM mutation observer**: Monitor for new items and extract immediately
- [ ] **Network request interception**: Extract from API calls if possible
- [ ] **Browser console debugging**: Manual testing of extraction logic

---

## 🔧 **Implementation Plan**

### **Step 1: Add Enhanced Logging**
```javascript
console.log(`[DEBUG] Extraction counts - lister: ${lister.length}, ipc: ${ipc.length}, links: ${links.length}`);
console.log(`[DEBUG] Sample titles from links method:`, links.slice(0, 10).map(x => x.title));
console.log(`[DEBUG] Sample titles from end:`, links.slice(-10).map(x => x.title));
```

### **Step 2: Fix Title Filtering**
```javascript
// OLD: Strict filtering
return id && title ? { imdbId: id, title, ... } : null;

// NEW: Lenient filtering
return id ? { imdbId: id, title: title || `Movie ${id}`, ... } : null;
```

### **Step 3: Timing Optimization**
```javascript
// Add delay after scrolling completes
window.scrollTo(0, 0);
await sleep(3000); // Wait for DOM stabilization
console.log(`Final extraction starting after delay...`);
```

---

## 📈 **Success Metrics**

- [ ] Extract 501+ items (match scrolling count)
- [ ] Maintain performance under 45 seconds total
- [ ] Preserve newest-first ordering
- [ ] No duplicate items in final result
- [ ] Successful TMDB metadata enhancement

---

## 🐛 **Debugging Commands**

### **Test Current Extraction**
```bash
curl "http://localhost:3002/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220?refresh=1" | jq '.metas | length'
```

### **Check Logs**
```bash
# Filter for pagination-related logs
grep -E "(Final count|Found.*items|lister\.length|ipc\.length)" server_logs.txt
```

### **Browser Console Debug**
```javascript
// Run in browser console on IMDb watchlist page
console.log('Total links:', document.querySelectorAll('a[href*="/title/"]').length);
console.log('Poster cards:', document.querySelectorAll('.ipc-poster-card').length);
console.log('Lister items:', document.querySelectorAll('.lister-item').length);
```

---

## 📝 **Version History**

- **v1.10.0**: Identified 250-item limit, enhanced scrolling to find 501 items
- **v1.11.0**: Fixed TypeScript compatibility, removed sorting menu, still stuck at 250 extraction
- **Next**: Focus on extraction logic fixes to match scrolling success

---

## 🔗 **Related Files**

- `/lib/fetch-watchlist.ts` - Main extraction logic
- `/pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts` - Catalog endpoint
- `/lib/version.ts` - Version management
- `/CLAUDE.md` - Project instructions and current status

---

*Last Updated: v1.11.0 - Pagination extraction barrier identified and documented*