# Free Deployment Guide: Render + Upstash

Complete free deployment using Render's free tier instead of Railway.

## Overview

- **Render**: Free tier (750 hours/month, spins down when idle)
- **Upstash**: Free tier (10K commands/day)
- **Vercel**: Free tier (existing)
- **Total Cost: $0/month**

## Phase 1: Set Up Upstash Redis (Free)

1. **Create Account**: [upstash.com](https://upstash.com) - free with GitHub
2. **Create Database**:
   - Name: `imdb-scraper-queue`
   - Select **Free tier**
   - Copy `UPSTASH_REDIS_URL`

## Phase 2: Deploy Worker to Render (Free)

1. **Create Account**: [render.com](https://render.com) - free with GitHub

2. **Create Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repo
   - **Root Directory**: `scraper-worker`
   - **Environment**: Docker
   - **Plan**: Free tier

3. **Environment Variables**:
   ```env
   UPSTASH_REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
   WORKER_SECRET=generate-random-secret-here
   TMDB_API_KEY=your-tmdb-api-key
   VERCEL_CALLBACK_SECRET=another-random-secret
   NODE_ENV=production
   PORT=10000
   ```

4. **Generate Secrets**:
   ```bash
   # Use any random string generator
   echo "worker-secret-$(date +%s)"
   echo "callback-secret-$(date +%s)"
   ```

5. **Deploy**:
   - Render auto-deploys from your repo
   - Wait 5-10 minutes for build
   - Note the URL: `https://your-app.onrender.com`

## Phase 3: Update Vercel (Free)

Add these environment variables in Vercel dashboard:

```env
WORKER_URL=https://your-app.onrender.com
WORKER_SECRET=same-as-render-secret
VERCEL_CALLBACK_SECRET=same-as-render-secret
VERCEL_URL=https://imdb-migrator.vercel.app
```

Redeploy Vercel to pick up new variables.

## Phase 4: Test Everything

1. **Health Check**:
   ```bash
   curl https://your-app.onrender.com/health
   ```

2. **Test Sync**:
   ```bash
   curl -X POST https://imdb-migrator.vercel.app/api/sync
   ```

3. **Test Stremio**:
   - Install: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=2.0.0`

## Important: Free Tier Limitations

### Render Free Tier
- **Spins down after 15 minutes** of inactivity
- **Cold start time**: 30-60 seconds to wake up
- **750 hours/month**: Plenty for periodic scraping
- **512MB RAM**: Should be sufficient

### Expected Behavior
- **First request**: Slow (cold start)
- **Subsequent requests**: Fast (while warm)
- **After 15min idle**: Spins down, next request slow again

### Optimization Tips
1. **Keep alive**: Ping health endpoint every 10 minutes
2. **User communication**: Show "waking up service" message
3. **Caching**: Rely heavily on cached results

## Keep-Alive Script (Optional)

Create a simple cron job to keep the service warm:

```bash
# Add to your crontab (every 10 minutes)
*/10 * * * * curl -s https://your-app.onrender.com/health > /dev/null
```

Or use a free service like [UptimeRobot](https://uptimerobot.com/) to ping your service.

## Monitoring Free Usage

### Render Dashboard
- Check hours used this month
- Monitor memory usage
- View deployment logs

### Upstash Dashboard
- Check command count
- Monitor connection health
- View Redis metrics

## Upgrade Path

When you outgrow free tiers:

1. **Render Starter**: $7/month (no sleep, more resources)
2. **Railway**: $5/month (alternative with different features)
3. **Google Cloud Run**: Pay-per-use (very cheap for light usage)

## Success with Free Tier

This free setup will work great if:
- ✅ You don't mind 30-60s cold starts occasionally
- ✅ Your usage is light-moderate (< 750 hours/month)
- ✅ You're okay with service spinning down when idle

Many developers successfully run production services on these free tiers!

## Troubleshooting Free Tier

**Service not responding:**
- Wait 60 seconds for cold start
- Check Render logs for errors
- Verify environment variables

**Exceeding free limits:**
- Monitor usage in dashboards
- Consider upgrade to paid tiers
- Optimize for fewer requests

**Cold start too slow:**
- Implement keep-alive ping
- Show loading states to users
- Cache results aggressively

Your IMDb scraper is now running completely free! 🎉