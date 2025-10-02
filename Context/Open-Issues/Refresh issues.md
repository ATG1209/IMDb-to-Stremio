# Refresh Button Regression (v3.0.x)

**Status:** ⚠️ Active — Under Investigation  
**Last Reviewed:** 2025-10-02  
**Impact:** Manual refresh occasionally returns empty or stale watchlists to end users.

---

## Project Context

The IMDb → Stremio Syncer is a hybrid project:

- **Web App (Next.js)** — UI lives under `pages/` with key flows in `pages/index.jsx` and `pages/dashboard/[userId].jsx`. Shared React widgets sit in `components/` (e.g., `CatalogPreview.jsx`, `Dropzone.jsx`, `ThemeToggle.jsx`). Styling is Tailwind (`styles/`, `tailwind.config.js`).
- **API Routes** — Scraping entry points such as `pages/api/imdb-watchlist.ts` and the Stremio catalog endpoints under `pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts` handle all server-side data access.
- **Shared Libraries** — Business logic is in `lib/`, notably `fetch-watchlist.ts` (Puppeteer + TMDB enrichment), `vpsWorkerClient.ts` (worker proxy), and `storage.ts` for SQLite caching.
- **CLI + Services** — `src/` contains a TypeScript CLI (`src/cli.ts`) together with services for IMDb monitoring, Trakt, realtime sync, config, storage, and utilities. These are bundled to `dist/` for command-line usage.
- **Dedicated Scraper Worker** — `scraper-worker/` is a standalone Node worker (deployed to a VPS) that exposes `/health`, `/cache/:userId`, and `/jobs` endpoints. The web app talks to it through `lib/vpsWorkerClient.ts` when `WORKER_URL` is configured.

Understanding this split is critical, because the refresh problem crosses the React dashboard, the Next.js API, the worker proxy, and the Puppeteer fallback.

---

## Version Timeline (3.0.x)

| Version | Highlights |
| --- | --- |
| **3.0.0** | Introduced the persistent dashboard route (`/dashboard/[userId]`), dual-tab UI, and routed the landing page to the dashboard experience. |
| **3.0.1** | UI refinements: toned-down gradients/shadows, compact refresh button, typography polish. No refresh logic changes. |
| **3.0.2** | Fixed data binding regression (`watchlistData.data` → `watchlistData.items`) and enforced newest-first ordering across dashboard and addon (`getFilteredWatchlist()` in `pages/dashboard/[userId].jsx`, plus reversal in `pages/api/stremio/...`). |
| **3.0.3** | Attempted to stabilise the manual refresh flow by hardening `lib/vpsWorkerClient.ts` and adding defensive guards in `pages/api/imdb-watchlist.ts`. Regression remains. |
| **3.1.0** | Implemented cache polling + source tagging in `lib/vpsWorkerClient.ts`, surfaced refresh provenance through API headers/payloads, and exposed the source + zero-item warning in the dashboard UI. |

---

## Current Findings (as of v3.1.0)

1. **Manual refresh chain** — The dashboard (`pages/dashboard/[userId].jsx`, `handleManualSync`) still drives `/api/imdb-watchlist?userId=...&refresh=1&nocache=1`, which the API treats as a forced refresh. Responses now include a `source` field and `X-Refresh-Source` header so clients can see where the data originated.
2. **Worker client behaviour** — `lib/vpsWorkerClient.ts` enqueues the job and then polls the worker cache (6 attempts, ~12s max). If fresh data appears it is returned immediately with `source=worker-refresh`; if the job is still running but a previous snapshot exists, that snapshot is returned with `source=worker-stale`. Only when the worker stays pending and no cache exists do callers fall back.
3. **API surface** — `/api/imdb-watchlist`, `/api/stremio/...` and `/api/sync-vps` all propagate the worker metadata. The dashboard uses it to display the source badge and to warn on zero-item results so support can tell whether a fallback fired.
4. **Fallback scraping** — The Puppeteer fallback remains active for true worker failures/timeouts. It is still resource-heavy and subject to environment limits, but it no longer triggers for the common "job finished right after enqueue" scenario.
5. **Ordering** — Newest-first remains consistent across dashboard and Stremio catalog. The worker continues to reverse arrays before caching.

---

## Detailed Analysis

### Refresh Flow Walkthrough

1. **Frontend action** — `handleManualSync` in `pages/dashboard/[userId].jsx` sends `refresh=1&nocache=1`. The UI disables the button and reports success/failure banners.
2. **API handling** — `pages/api/imdb-watchlist.ts` validates the user ID and, when `WORKER_URL` is configured, prefers the VPS worker, carrying the worker’s `source` metadata through to the response (and HTTP header).
3. **Worker proxy** — The `lib/vpsWorkerClient.ts` refresh flow now:
   - Optionally captures the pre-refresh cache (for comparison/backup).
   - Enqueues a job via `/jobs`.
   - Polls `/cache/:userId` up to six times (two-second spacing) looking for the freshly populated cache entry.
   - Returns `worker-refresh` / `worker-job` data when available without forcing a fallback.
4. **Fallback** — Only if polling times out with no data (or the worker health check fails) does the API move to `fetchWatchlist(userId, { forceRefresh })`. When a stale snapshot exists it is returned with `source=worker-stale` instead of hitting Puppeteer.

### Why Users Might Still See Empty Lists

- If the worker job exceeds ~12 seconds and no prior cache exists, the API falls back to Puppeteer. Failures in that path (Chromium launch, IMDb blocking, TMDB lookups) still surface as empty payloads or error 500.
- Stale cache fallback returns the last known dataset. When the user expects brand new items, the UI now makes this obvious via the `worker-stale` source badge, but content still appears unchanged until the worker finishes.
- When an IMDb watchlist is private or unreachable, both worker and fallback will ultimately return zero items. The dashboard now warns the user, but manual intervention is still required.

### Newest-First Ordering

- `pages/dashboard/[userId].jsx` ensures filtered results are reversed prior to rendering.
- `pages/api/stremio/[userId]/catalog/[type]/[catalogId].ts` filters by `movie` vs `tv`, reverses to newest-first, and returns Stremio metas with logging to confirm order. The mismatch cited in earlier notes is resolved.

---

## Outstanding Gaps & Risks

- **Polling window** — The worker poll currently tops out around 12 seconds. Jobs that legitimately take longer still degrade into stale cache or fallback behaviour. We may need adaptive polling (backoff + eventual status endpoint) or a way to stream progress to the UI.
- **Fallback fragility** — Dependence on Puppeteer inside the Next.js runtime remains brittle. Longer term we should move the fallback into the worker, or disable it in production and surface a clear "refresh queued" state instead of hammering Vercel functions.
- **Monitoring** — We now emit `X-Refresh-Source`, but nothing is capturing it. Add logging/metrics so we can quantify worker-cache vs worker-refresh vs fallback usage.
- **Automated coverage** — There are still no integration tests for cold-cache refreshes. Without tests it is easy to regress the polling or dashboard messaging.

---

## Next Steps / To-Do

1. Add instrumentation (logs/metrics) capturing `X-Refresh-Source` so we can monitor worker vs fallback usage in production.
2. Explore extending the worker API with a `/jobs/:id` poll that the dashboard could use to show "job running" instead of immediately calling the fallback.
3. Build integration tests around `/api/imdb-watchlist` to simulate cold cache, long-running worker jobs, and fallback errors.
4. Evaluate moving the Puppeteer fallback into the worker (or removing it in production) to avoid double-scraping and Vercel timeouts.

---

**Owners:** Web team (dashboard/API), Infra/Worker team (VPS worker, queue).  
**Blocking dependencies:** Stable VPS worker deployment, Puppeteer compatibility in hosting environment.
