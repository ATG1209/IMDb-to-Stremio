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

## Claude Code Workflow

**ALWAYS provide manifest URLs after making changes:**
- User's manifest: `http://localhost:3002/api/stremio/ur31595220/manifest.json?v={VERSION}`
- Generic manifest: `http://localhost:3002/api/stremio/manifest.json?v={VERSION}`
- This allows immediate testing of updates in Stremio