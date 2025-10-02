# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CLI tool for migrating IMDb watchlists and ratings to Stremio via Trakt. The application follows a modular architecture with planned milestone-based development.

## Development Commands

- **Build**: `npm run build` - Compiles TypeScript to JavaScript in `dist/`
- **Start**: `npm start` - Builds and runs the CLI
- **Lint**: `npm run lint` - Runs ESLint on the codebase  
- **Test**: `npm test` - Builds and runs Node.js native tests

## Architecture

The codebase is organized into functional modules:

- `src/cli.ts` - Main CLI entry point and argument parsing
- `src/imdb/parser.ts` - CSV parsing for IMDb exports (watchlist/ratings)
- `src/services/trakt.ts` - Trakt API client with OAuth authentication
- `src/match/index.ts` - Title mapping logic between IMDb and Trakt
- `src/run/dryRun.ts` - Preview functionality before actual import
- `src/run/import.ts` - Actual import execution with checkpointing
- `src/util/logger.ts` - Logging utilities

## Key Implementation Details

- Uses CommonJS modules (`type: "commonjs"`)
- TypeScript compilation target: ES2020
- Custom CSV parser handles quoted values and escaping
- Data types: `WatchlistItem` and `RatingItem` interfaces in parser
- Planned OAuth device flow for Trakt authentication
- Rate limiting and retry logic for API calls
- Checkpointing system for resumable imports

## Development Notes

The project is currently in early development (M0 milestone). Core CSV parsing is implemented but most service integrations are placeholder implementations.

## Version Management

**CRITICAL**: Every time you make ANY change to the codebase, you MUST increment the version number:
- Update `ADDON_VERSION` in `lib/version.ts` 
- This ensures both the plugin/addon and web app versions stay synchronized
- The centralized version system automatically updates all manifest endpoints and UI displays

## IMDb Stremio Addon - Current Status & Issues

### ✅ **Completed Optimizations (v1.10.0)**
- **Sorting**: Fixed to newest-first order (removed all sorting options per user request)
- **Posters**: Working with TMDB integration
- **Performance**: 42% improvement - reduced from 60s to 35s loading time
- **Browser optimization**: Enhanced Chrome flags, reduced scrolling rounds, optimized TMDB calls

### ⚠️ **Critical Known Issues**

**1. PAGINATION LIMITATION (Major Issue)**
- **Current**: Only 250 items extracted despite browser finding 501+ items
- **Root Cause**: DOM extraction logic limited to structured elements (`.lister-item`, `.ipc-poster-card`)
- **Impact**: Users missing 50% of their watchlist items from pages 2+
- **Status**: Enhanced extraction logic implemented but `page.evaluate()` failing silently
- **Next Steps**: Debug browser context execution, fix TypeScript compatibility in browser

**2. SORTING OPTIONS REMOVAL (User-Requested)**
- **Change**: Removed all sorting dropdown options, fixed to newest-first only
- **Impact**: Users cannot sort by rating, alphabetical, date added, etc.
- **Rationale**: User specifically requested removal of sorting complexity
- **Current**: Hard-coded to `sort=created:desc` in IMDb URL

**3. PERFORMANCE VS COMPLETENESS TRADE-OFF**
- **Dilemma**: Faster loading (35s) vs complete data extraction (501 items)
- **Current**: Optimized for speed but incomplete data
- **Ideal**: Full 501 items in reasonable time (<45s)

### 🔧 **Technical Implementation Notes**

**Browser Automation (`lib/fetch-watchlist.ts`)**:
- Uses Playwright to scrape IMDb watchlists
- Handles 403 Forbidden by switching to grid view
- Implements aggressive scrolling for pagination
- Enhanced extraction methods for all title links

**Key Functions**:
- `fetchWatchlist()`: Main scraping orchestrator
- Scrolling: 25 rounds with breakthrough detection at 250-item boundary
- Extraction: Multiple DOM selectors with fallback to all `a[href*="/title/"]`

**Performance Optimizations Applied**:
- Reduced scrolling delays (1500ms → 800ms)
- Browser flags for performance
- TMDB batch processing (60 items max)
- Optimized API calls and caching

### 🎯 **Testing Endpoints**

**Current Manifests (v1.10.0)**:
- User's: `http://localhost:3002/api/stremio/ur31595220/manifest.json?v=1.10.0`
- Generic: `http://localhost:3002/api/stremio/manifest.json?v=1.10.0`

**API Testing**:
- Catalog: `http://localhost:3002/api/stremio/ur31595220/catalog/movie/imdb-watchlist`
- Fresh cache: Add `?refresh=1&nocache=1` parameters

### 📋 **Priority Issues for Resolution**

1. **HIGH**: Fix pagination to extract all 501 items (currently only 250)
2. **MEDIUM**: Debug `page.evaluate()` browser context execution
3. **LOW**: Consider re-adding basic sorting options if user requests
4. **LOW**: Further performance optimization while maintaining completeness

### 🚨 **Important Notes for Developers**

- **Version Management**: Always increment `ADDON_VERSION` in `lib/version.ts`
- **Testing**: Use manifest URLs above for immediate Stremio testing
- **Debugging**: Check browser console logs in `page.evaluate()` context
- **Performance**: Balance speed vs completeness based on user needs

## Complete System Architecture

**This project has a HYBRID architecture:** Vercel frontend + VPS backend worker.

### **Architecture Overview**

```
User Browser (Stremio App)
    ↓
Vercel Deployment (imdb-migrator.vercel.app)
├─ Web App UI (Dashboard, Catalog Preview)
└─ Stremio API Endpoints (/api/stremio/*)
    ↓
    Calls VPS Worker for data
    ↓
VPS Worker Service (37.27.92.76:3003)
├─ IMDb Scraping (Playwright)
├─ TMDB Integration (Poster images)
└─ Redis Cache (24-hour TTL)
```

### **How the System Works**

1. **User visits web app** → https://imdb-migrator.vercel.app
2. **Enters IMDb user ID** → e.g., ur31595220
3. **Vercel API calls VPS Worker:**
   - Checks cache first: `GET /cache/:userId`
   - If cache miss: `POST /jobs` (triggers scraping)
4. **VPS Worker processes request:**
   - Launches Playwright browser
   - Scrapes IMDb watchlist
   - Cleans titles (removes numbering: "410. Title" → "Title")
   - Calls TMDB API for posters
   - Caches to Redis
5. **Vercel serves Stremio addon** with data from VPS
6. **User installs in Stremio** → addon works perfectly!

### **Deployment Workflow**

**For Vercel (Frontend + API):**
- Automatically deploys on `git push origin main`
- No manual steps needed
- Environment variables set in Vercel dashboard

**For VPS Worker (Backend scraping):**
  1. Make changes locally and push to GitHub: `git push origin main`
  2. Provide VPS dev with copy-paste instructions (see below)
  3. VPS dev executes commands on VPS server
  4. Verify changes are deployed and working

### **Production URLs**

**Vercel (Main deployment):**
- Web App: `https://imdb-migrator.vercel.app`
- Addon Manifest: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json`
- Movie Catalog: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-movies-ur31595220.json`
- Series Catalog: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/catalog/series/imdb-series-ur31595220.json`

**VPS Worker (Backend only):**
- **Location**: Remote VPS at `37.27.92.76`
- **Port**: 3003 (HTTP only, not public-facing)
- **Endpoints** (Internal use only):
  - Worker Jobs: `http://37.27.92.76:3003/jobs`
  - Worker Cache: `http://37.27.92.76:3003/cache/{userId}`
  - Worker Health: `http://37.27.92.76:3003/health`
- **Authentication**: Bearer token `imdb-worker-2025-secret`

### **Environment Variables**

**Vercel Environment:**
```bash
NODE_ENV=production
WORKER_URL=http://37.27.92.76:3003
WORKER_SECRET=imdb-worker-2025-secret
```

**VPS Worker Environment:**
```bash
NODE_ENV=production
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
DEFAULT_IMDB_USER_ID=ur31595220
WORKER_SECRET=imdb-worker-2025-secret
REDIS_URL=redis://localhost:6379
```

### **Working with VPS Dev**
When changes need to be deployed to the VPS, Claude will provide **copy-paste instructions** for the VPS dev to execute. These instructions will be clearly marked and ready to copy-paste directly into the VPS terminal.

**Example workflow:**
1. Claude makes code changes locally
2. Claude pushes to GitHub
3. Claude generates copy-paste instructions for VPS dev
4. User sends instructions to VPS dev
5. VPS dev executes commands
6. Claude verifies deployment with test commands

### **Standard VPS Deployment Commands**
```bash
# Navigate to worker directory
cd /path/to/scraper-worker

# Pull latest changes from GitHub
git pull origin main

# Install any new dependencies (if package.json changed)
npm install

# Restart worker service
npm restart

# Verify worker is running
curl http://localhost:3003/health
```

### **Testing Changes on VPS**
```bash
# Test worker job submission
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Check job status
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/jobs

# Verify cache data
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data[0]'

# Test addon manifest
curl http://37.27.92.76:3000/api/stremio/ur31595220/manifest.json
```

## Claude Code Workflow

**ALWAYS provide production URLs after making changes:**
- Web App: `https://imdb-migrator.vercel.app`
- Addon Manifest: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v={VERSION}`
- This allows immediate testing of updates in Stremio

**Local Development URLs:**
- Local Web App: `http://localhost:3000`
- Local Manifest: `http://localhost:3000/api/stremio/ur31595220/manifest.json?v={VERSION}`

## Key Documentation

**For complete architecture and troubleshooting:**
- See `/Context/Ultimate-Workflow-Fix.md` for comprehensive system documentation
- See `/Context/Open-Issues/Server Issue - TMDB Posters & HTTPS.md` for issue resolution history