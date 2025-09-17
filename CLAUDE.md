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

## Claude Code Workflow

**ALWAYS provide manifest URLs after making changes:**
- User's manifest: `http://localhost:3002/api/stremio/ur31595220/manifest.json?v={VERSION}`
- Generic manifest: `http://localhost:3002/api/stremio/manifest.json?v={VERSION}`
- This allows immediate testing of updates in Stremio