# Deployment Guide: Hybrid Worker Architecture

This guide walks you through deploying the complete IMDb scraper solution using the hybrid worker architecture.

## Overview

The solution consists of two parts:
1. **Vercel App**: Fast Next.js API and Stremio addon serving (existing)
2. **Railway Worker**: Dedicated browser automation service (new)

This architecture solves the serverless browser automation limitation while keeping optimal performance.

## Phase 1: Set Up Upstash Redis (Free)

1. **Create Upstash Account**:
   - Go to [upstash.com](https://upstash.com)
   - Sign up with GitHub (free)

2. **Create Redis Database**:
   - Click "Create Database"
   - Name: `imdb-scraper-queue`
   - Region: Choose closest to your users
   - Type: Select "Free" tier
   - Click "Create"

3. **Get Connection URL**:
   - Copy the "UPSTASH_REDIS_URL" from the database dashboard
   - It looks like: `rediss://default:xxx@xxx.upstash.io:6379`

## Phase 2: Deploy Worker to Railway

1. **Create Railway Account**:
   - Go to [railway.app](https://railway.app)
   - Sign up with GitHub

2. **Deploy from Repository**:
   ```bash
   # Option A: Deploy entire repo (Railway will detect scraper-worker folder)
   railway login
   railway create
   railway up --service scraper-worker

   # Option B: Deploy from GitHub (recommended)
   # Connect your GitHub repo in Railway dashboard
   # Set root directory to "scraper-worker"
   ```

3. **Configure Environment Variables** in Railway dashboard:
   ```env
   UPSTASH_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
   WORKER_SECRET=your-super-secret-key-here
   TMDB_API_KEY=your-tmdb-api-key
   VERCEL_CALLBACK_SECRET=another-secret-for-callbacks
   NODE_ENV=production
   PORT=3000
   ```

4. **Generate Secrets**:
   ```bash
   # Generate random secrets
   openssl rand -base64 32  # For WORKER_SECRET
   openssl rand -base64 32  # For VERCEL_CALLBACK_SECRET
   ```

5. **Deploy**:
   - Railway will automatically build using the Dockerfile
   - Wait for deployment to complete
   - Note the deployment URL (e.g., `https://scraper-worker-production.up.railway.app`)

## Phase 3: Update Vercel Configuration

1. **Add Environment Variables** in Vercel dashboard:
   ```env
   WORKER_URL=https://scraper-worker-production.up.railway.app
   WORKER_SECRET=your-super-secret-key-here
   VERCEL_CALLBACK_SECRET=another-secret-for-callbacks
   VERCEL_URL=https://imdb-migrator.vercel.app
   ```

2. **Redeploy Vercel**:
   - Trigger a new deployment to pick up environment variables
   - Either push to main branch or use Vercel dashboard

## Phase 4: Test the Integration

1. **Test Worker Health**:
   ```bash
   curl https://scraper-worker-production.up.railway.app/health
   ```
   Should return healthy status.

2. **Test Job Queue**:
   ```bash
   curl -X POST https://scraper-worker-production.up.railway.app/jobs \\
     -H "Authorization: Bearer YOUR_WORKER_SECRET" \\
     -H "Content-Type: application/json" \\
     -d '{
       "imdbUserId": "ur31595220",
       "forceRefresh": true
     }'
   ```

3. **Test Vercel Integration**:
   ```bash
   curl -X POST https://imdb-migrator.vercel.app/api/sync
   ```
   Should return job ID instead of direct scraping.

4. **Test Stremio Addon**:
   - Install addon: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=2.0.0`
   - Should show populated watchlist after worker completes

## Monitoring and Troubleshooting

### Railway Logs
```bash
railway logs -s scraper-worker
```

### Vercel Logs
Check Vercel dashboard for function logs.

### Health Checks
- Worker: `GET /health`
- Worker Metrics: `GET /health/metrics`
- Redis: Check Upstash dashboard

### Common Issues

**1. Worker Service Unreachable**
- Check Railway deployment status
- Verify WORKER_URL in Vercel env vars
- Test health endpoint directly

**2. Authentication Errors**
- Verify WORKER_SECRET matches between Railway and Vercel
- Check Authorization header format

**3. Redis Connection Issues**
- Verify UPSTASH_REDIS_URL is correct
- Check Upstash dashboard for connection metrics

**4. Browser Launch Failures**
- Check Railway logs for missing dependencies
- Verify Dockerfile is using playwright:focal base image

**5. Empty Watchlist Results**
- Check if IMDb user ID is public
- Verify TMDB_API_KEY is valid
- Check worker logs for scraping errors

## Cost Breakdown

- **Upstash Redis**: Free tier (10K commands/day)
- **Railway**: $5/month (starter plan)
- **Vercel**: Free (existing)
- **Total**: $5/month additional cost

## Architecture Benefits

✅ **Serverless Compatibility**: Browser automation runs in proper container
✅ **Performance**: Vercel serves cached results instantly
✅ **Reliability**: Queue-based processing with retries
✅ **Scalability**: Can add more worker instances
✅ **Cost Effective**: Only $5/month vs $30-50/month for managed services
✅ **Monitoring**: Full observability and health checks

## Rollback Plan

If issues arise, you can temporarily disable the worker:

1. **Remove Environment Variables** from Vercel:
   - Remove `WORKER_URL` and `WORKER_SECRET`
   - This will make catalog endpoints return empty arrays

2. **Alternative: Feature Flag**:
   ```env
   USE_WORKER=false
   ```
   Then update catalog code to check this flag.

3. **Complete Rollback**:
   - Revert to previous version (1.36.0)
   - Re-enable direct scraping code

## Next Steps

1. **Monitor Performance**: Check Railway metrics for memory/CPU usage
2. **Scale if Needed**: Add more Railway instances for heavy usage
3. **Add More Users**: Extend to support multiple IMDb accounts
4. **Automate**: Set up periodic sync cron jobs
5. **Cache Optimization**: Implement smarter caching strategies

## Success Criteria

✅ Worker service healthy and responding
✅ Redis queue processing jobs
✅ Vercel returning job IDs for sync requests
✅ Stremio addon showing populated watchlists
✅ No browser automation errors in logs
✅ Response times under 500ms for cached data

Your IMDb scraper is now production-ready with proper browser automation! 🚀