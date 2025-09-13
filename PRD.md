# IMDb → Stremio Migrator — PRD

## 1) Summary
- Build a small, reliable tool to migrate a user’s IMDb data (watchlist and ratings) into Stremio by leveraging the Trakt bridge (primary path) and exploring a direct path (secondary/experimental) if feasible.
- First deliverable is a CLI that accepts IMDb CSV exports, previews the mapping, then imports into Trakt so Stremio can sync. Later, consider a minimal GUI.

## 2) Goals
- Accurate transfer of IMDb watchlist and ratings into Stremio (via Trakt sync).
- Dry‑run preview with clear unresolved items and conflict handling.
- Idempotent, safe re‑runs; robust error reporting and resumability.
- Minimal setup for users; small number of steps end‑to‑end.

## 3) Non‑Goals
- Two‑way continuous sync (IMDb ↔ Stremio).
- Automatic handling of all IMDb lists beyond watchlist (e.g., custom lists) in v1.
- Building a long‑running service; this is a local, user‑run tool.

## 4) Users & Personas
- Movie/TV enthusiast consolidating history into Stremio.
- Power user migrating platforms who values transparency and control.
- Privacy‑conscious user preferring local tooling, no server storage.

## 5) Inputs/Outputs
- Inputs: IMDb CSV exports from the user’s account (ratings.csv, watchlist.csv). Optional: a mapping override file for edge cases.
- Outputs (Primary): Imported data to Trakt watchlist and ratings; Stremio then syncs via its Trakt integration.
- Outputs (Secondary/Exploratory): Direct injection into Stremio local library if a stable, documented path exists (likely out of scope for v1).

## 6) Constraints & Assumptions
- Trakt supports `imdb` IDs and has OAuth device code flow for CLI usage.
- Stremio already supports Trakt sync and will reflect the migrated data.
- IMDb export schemas are reasonably stable but may change without notice.
- Network/API rate limits and partial failures are expected; retries required.

## 7) Key Requirements
Functional
- Parse IMDb CSVs into a normalized internal model.
- Map titles using `imdb_id` (preferred) and fall back to search when missing.
- Provide a dry‑run plan: counts, mapped/unmapped, duplicates, estimated ops.
- Import to Trakt: add to watchlist; push ratings with correct values and types.
- Idempotency: avoid duplicates; safe to re‑run; support resume after failure.
- Reporting: summary, per‑item status, exportable log of failures.

Non‑Functional
- Clear CLI UX; actionable messages; no surprises.
- Privacy‑first: keep everything local; do not store tokens or data remotely.
- Reliable: handles pagination, throttling, and transient API errors.

## 8) UX Flow (CLI v1)
1) User exports IMDb data (ratings.csv, watchlist.csv).
2) Run CLI with paths to CSVs.
3) Tool authenticates with Trakt using device code flow.
4) Dry‑run preview: resolve IDs, show unmapped items and action counts.
5) User confirms import; tool executes with retries and progress.
6) Summary: totals, failures, next steps (e.g., open Stremio to sync Trakt).

## 9) Data Model (internal)
- Title: `imdb_id`, `title`, `year`, `type` (movie/show), `season/episode?` (optional), `original_title?`.
- Rating: `imdb_id`, `value` (1–10), `rated_at` (timestamp if present).
- ImportItem: `source` (watchlist|rating), `status` (planned|mapped|imported|failed), `reason?`.

## 10) Mapping Strategy
- Primary key: `imdb_id` from IMDb CSV rows.
- For missing IDs, attempt fuzzy search via Trakt by title+year+type.
- Manual overrides: accept a user‑provided CSV/JSON mapping file to resolve tricky cases.

## 11) Tech Approach
- Language: Node.js with TypeScript (CLI focus). Alternative is Python; choose TS for ecosystem and DX.
- CLI: `commander` (or built‑in minimal parser), device‑code OAuth for Trakt.
- CSV parsing: `csv-parse` (or similar) with strict schema validation via `zod`.
- HTTP: `fetch`/`undici` or `axios` with retry/backoff.
- Structure:
  - `src/cli.ts` — entrypoint and command wiring
  - `src/imdb/parser.ts` — CSV readers and normalizers
  - `src/match/index.ts` — mapping and resolution logic
  - `src/services/trakt.ts` — OAuth and API calls (watchlist, ratings)
  - `src/run/dryRun.ts` — preview plan and stats
  - `src/run/import.ts` — execution with retries, progress, idempotency
  - `src/util/logger.ts` — structured logs and reports
- Config: `.env` for Trakt client credentials; store tokens locally (e.g., JSON keychain in user’s home) with opt‑out.

## 12) API Surfaces (Trakt)
- OAuth device code flow: obtain `access_token` for user.
- Watchlist import: add movies/shows by `ids.imdb`.
- Ratings import: set rating for movies/shows by `ids.imdb` with timestamp.
- Rate limiting: respect headers; exponential backoff and jitter.

## 13) Idempotency & Safety
- De‑duplicate by `imdb_id` before calling APIs.
- For watchlist: check existing membership via a cached snapshot; skip existing.
- For ratings: overwrite or upsert behavior, configurable with `--mode=skip|overwrite`.
- Persist checkpoint state so re‑runs resume after last successful batch.

## 14) Telemetry & Reporting
- Console summary + write a `migration-report.json` with per‑item results.
- Export `unmapped.csv` and `failed.csv` for user review.

## 15) Risks & Mitigations
- Schema drift in IMDb CSV — validate and surface clear errors; version detection.
- Trakt throttling — implement global limiter and retry policies.
- Unmapped/ambiguous titles — enable manual mapping and re‑runs.
- Stremio not reflecting changes promptly — document sync steps and delays.

## 16) Milestones
- M0: Repo skeleton, CLI scaffold, CSV parsing, types, unit tests for parsers.
- M1: Trakt OAuth device flow; dry‑run with mapping by `imdb_id` only.
- M2: Watchlist import; checkpointing; basic reports.
- M3: Ratings import; overwrite/skip modes; full reports.
- M4: Manual overrides; fuzzy search fallback; improved logs.
- M5: Optional minimal GUI; packaging and docs.

## 17) Success Metrics
- ≥95% of items imported automatically when `imdb_id` present.
- <2% transient failure rate with automatic retry.
- <5 minutes total for 2k items on typical connections.

## 18) Open Questions
- Any must‑have support for IMDb custom lists in v1?
- Should ratings timestamps be preserved strictly? (may affect Trakt history)
- Default behavior for existing Trakt ratings: skip vs. overwrite?
- Is a direct Stremio write path required, or is Trakt sufficient?

## 19) Future Considerations
- Support for custom IMDb lists; reviews and comments export (if feasible).
- Two‑way reconciliation tool (advanced users).
- Portable migration pack: generate a file the user can re‑apply later.
