# Agent Playbook

## Overview
This repository powers the IMDb → Stremio web dashboard and the supporting Stremio add-on. Deployments are triggered automatically when commits land on `main`, so keep the branch healthy and production-ready.

## Release Checklist
- Run `npm run lint` locally before every push.
- Update `lib/version.ts` so both `APP_VERSION` and `ADDON_VERSION` increment with each release.
- Include the version bump and a short summary in the commit message (e.g., `_Fix TMDB detection · v3.3.x_`).
- Push to `main`; Vercel handles the new deployment automatically.

## Post-Deploy Verification
- Hit `https://imdb-migrator.vercel.app/simple-dashboard?userId=<id>&forceRefresh=true` and confirm the version badge shows the new value.
- Check the dashboard counts for movies vs. series to ensure TMDB classification is healthy.
- Tail Vercel logs for new warnings like `[TMDB] Movie search failed …` to catch API issues early.

## Operational Notes
- Production environment variables live in Vercel. Confirm `TMDB_API_KEY`, `WORKER_URL`, and `WORKER_SECRET` before investigating classification bugs.
- The VPS worker caches data for ~24 hours; use the dashboard “Refresh” button to trigger a fresh scrape when testing.
- If TMDB rate-limits occur, retry after ~60 s; the API allows ~40 requests/sec across the worker and web app.
