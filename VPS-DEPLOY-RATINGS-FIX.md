# VPS Deployment Instructions - Ratings Fix (v3.7.5)

## Copy-Paste Commands for VPS Dev

```bash
# Navigate to scraper-worker directory
cd /root/scraper-worker

# Pull latest code from GitHub (includes TMDB rating integration)
git pull origin main

# Install any new dependencies
npm install

# Restart the worker service
pm2 restart imdb-worker

# Verify worker is running with new code
pm2 logs imdb-worker --lines 20

# Test the worker health endpoint
curl http://localhost:3003/health

# Clear Redis cache to force fresh scrapes with ratings
redis-cli FLUSHALL

# Test scraping with ratings
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer imdb-worker-2025-secret" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Wait 30 seconds for job to complete, then check cache
sleep 30

# Verify ratings are in cache
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://localhost:3003/cache/ur31595220 | jq '.data[0] | {title, imdbRating, numRatings}'
```

## Expected Output

After running the cache check command, you should see ratings like:

```json
{
  "title": "The Pianist",
  "imdbRating": 8.38,
  "numRatings": 912345
}
```

If you see `null` for `imdbRating`, the TMDB integration is not working.

## Troubleshooting

**If ratings are still null:**

1. Check TMDB API key is configured:
```bash
cd /root/scraper-worker
cat .env | grep TMDB
```

Should show:
```
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
```

2. Check worker logs for TMDB errors:
```bash
pm2 logs imdb-worker --lines 100 | grep TMDB
```

3. Verify the code version:
```bash
cd /root/scraper-worker
git log --oneline -5
```

Should include commit: `✨ Add IMDb ratings with clickable links - v3.6.0` or later

## What This Fixes

- Dashboard will show `⭐ 8.4` rating badges below movie posters (instead of "No rating")
- Ratings are clickable links to IMDb movie pages
- VPS worker now fetches ratings from TMDB API during scraping
- Data includes `imdbRating`, `numRatings`, `runtime`, and `popularity` fields

## Verification Steps

After deployment, test from your local machine:

```bash
# Test VPS worker directly
curl -H "Authorization: Bearer imdb-worker-2025-secret" \
  http://37.27.92.76:3003/cache/ur31595220 | jq '.data[0] | {title, imdbRating}'

# Test through Vercel API
curl https://imdb-migrator.vercel.app/api/imdb-watchlist?userId=ur31595220 | jq '.items[0] | {title, imdbRating}'

# Check dashboard in browser
open https://imdb-migrator.vercel.app/dashboard/ur31595220
```

All should show ratings like `"imdbRating": 8.38`.
