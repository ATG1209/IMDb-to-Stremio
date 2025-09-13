# Implementation Plan

## M0: Repository Skeleton and Tooling
- Initialize Node.js project with TypeScript.
- Configure build tools (`tsconfig.json`, ESLint, Prettier) and testing framework.
- Add GitHub Actions workflow for linting and tests on each push.
- Draft a `README.md` describing setup and basic usage.
- Establish directory structure:
  - `src/cli.ts`
  - `src/imdb/parser.ts`
  - `src/match/index.ts`
  - `src/services/trakt.ts`
  - `src/run/dryRun.ts`
  - `src/run/import.ts`
  - `src/util/logger.ts`
- Implement basic CSV parsing for IMDb exports and accompanying unit tests.

## M1: Trakt Authentication & Dry‑Run Workflow
- Implement `src/services/trakt.ts` with device code OAuth flow.
- Build mapping logic using `imdb_id` only.
- Create `src/run/dryRun.ts` to:
  - Read CSV data, map titles, and compute statistics.
  - Present preview of mapped/unmapped items and estimated operations.
- Extend CLI to accept paths to CSVs and trigger dry run.

## M2: Watchlist Import
- Implement `src/run/import.ts` to add items to Trakt watchlist.
- Add checkpointing and resumability to avoid reprocessing.
- Provide summary reports and export `migration-report.json`, `unmapped.csv`, and `failed.csv`.
- Respect Trakt rate limits with retry/backoff strategies.

## M3: Ratings Import
- Extend import logic to push ratings with configurable mode (`--mode=skip|overwrite`).
- Ensure idempotent behavior and update reporting.

## M4: Enhanced Mapping
- Support manual overrides via user-provided mapping file.
- Add fuzzy search fallback when `imdb_id` is missing.
- Improve logging and error messages.

## M5: Optional GUI & Packaging
- Explore minimal GUI (e.g., Electron/Tauri) built on CLI API.
- Package distribution and documentation for end users.

## Cross‑Cutting Concerns
- Robust error handling, pagination, and retry logic.
- Privacy: store tokens locally with opt-out.
- Comprehensive documentation and examples.
- Provide `.env.example` outlining required Trakt credentials.
