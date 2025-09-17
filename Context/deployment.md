# 🚀 IMDb to Stremio Addon - Production Deployment Guide

## 📋 Overview

This guide covers deploying the IMDb Watchlist to Stremio addon on **Vercel** with automatic sync every **6 hours**.

### ✨ What You Get After Deployment

- **🎬 Complete Stremio Addon**: Movies + TV Series from IMDb watchlist
- **🔄 Auto-sync**: Updates every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **🌐 Global CDN**: Fast worldwide access via Vercel
- **💰 100% Free**: No hosting costs on Vercel free tier
- **🔒 Secure**: Environment variables for API keys

---

## 🛠️ Prerequisites

### 1. **Get TMDB API Key**

1. Go to [TMDB API](https://www.themoviedb.org/settings/api)
2. Create account → Request API key
3. Copy your API key (starts with letters/numbers)

### 2. **GitHub Repository Setup**

Ensure your code is pushed to GitHub:

```bash
# If not already a git repo
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo and push
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

---

## 🚀 Deployment Steps

### Step 1: Deploy to Vercel

#### Option A: One-Click Deploy
1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"New Project"**
4. Import your GitHub repository
5. Click **Deploy**

#### Option B: Vercel CLI
```bash
npm i -g vercel
vercel login
vercel --prod
```

### Step 2: Configure Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

```env
TMDB_API_KEY=your_tmdb_api_key_here
DEFAULT_IMDB_USER_ID=ur31595220
CRON_SECRET=your_secure_random_secret
NODE_ENV=production
```

**Generate a secure CRON_SECRET:**
```bash
# Use this command or any random string generator
openssl rand -base64 32
```

### Step 3: Setup GitHub Actions (Auto-sync)

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these **Repository Secrets**:

```
CRON_SECRET=same_value_as_vercel_env_var
VERCEL_APP_URL=https://your-actual-app.vercel.app
```

**Important**: Use your actual Vercel app URL from step 1.

### Step 4: Test Your Deployment

Visit these URLs to verify (replace with your actual Vercel URL):

- **Manifest**: `https://your-app.vercel.app/api/stremio/ur31595220/manifest.json`
- **Movies**: `https://your-app.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-watchlist`
- **Series**: `https://your-app.vercel.app/api/stremio/ur31595220/catalog/series/imdb-watchlist`

All should return JSON data without errors.

---

## 📱 Installing in Stremio

### Step 1: Copy Your Manifest URL
```
https://your-app.vercel.app/api/stremio/ur31595220/manifest.json
```

### Step 2: Add to Stremio
1. Open **Stremio**
2. Go to **🧩 Addons**
3. Click **📋 Addon Repository URL**
4. Paste your manifest URL
5. Click **Install**

### Step 3: Verify Installation
- Browse **🎬 Movies** and **📺 Series** tabs
- Your IMDb watchlist items should appear with posters
- Updates automatically every 6 hours

---

## 🔧 Configuration Files Explained

### `vercel.json`
```json
{
  "functions": {
    "pages/api/**/*.ts": {
      "maxDuration": 300
    }
  }
}
```
- **Purpose**: Extends Vercel timeout to 5 minutes for Playwright scraping
- **Critical**: Without this, functions timeout at 10 seconds

### `.github/workflows/sync.yml`
```yaml
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
```
- **Purpose**: Triggers watchlist sync automatically
- **Authentication**: Uses `CRON_SECRET` to secure the endpoint
- **Monitoring**: Includes verification steps for health checks

---

## 🐛 Troubleshooting

### Addon Not Loading in Stremio
- ✅ Check manifest URL returns valid JSON in browser
- ✅ Verify HTTPS (not HTTP) - Stremio requires HTTPS
- ✅ Test URLs individually before adding to Stremio

### No Items Showing
- ✅ Check `TMDB_API_KEY` is set in Vercel environment variables
- ✅ Verify `DEFAULT_IMDB_USER_ID` format (`ur` + numbers)
- ✅ Wait for first sync (may take 5-10 minutes after deployment)
- ✅ Check Vercel Functions logs for errors

### Automatic Sync Not Working
- ✅ Verify GitHub Actions tab for workflow execution
- ✅ Check `CRON_SECRET` matches exactly in both Vercel and GitHub
- ✅ Confirm `VERCEL_APP_URL` points to correct deployment
- ✅ Test manual sync: `POST /api/cron/sync-watchlist` with auth header

### Check Logs
**Vercel Logs:**
1. Vercel Dashboard → Your Project → Functions
2. Click on recent invocations
3. Check for errors in function execution

**GitHub Actions Logs:**
1. GitHub repo → Actions tab
2. Click on workflow runs
3. Check for sync execution errors

---

## 📊 Performance & Limits

### Vercel Free Tier Limits
- ✅ **100GB bandwidth/month** (sufficient for personal use)
- ✅ **1000 serverless executions/day** (more than enough)
- ✅ **10-second timeout** (extended to 300s via vercel.json)

### GitHub Actions Free Tier
- ✅ **2000 minutes/month** (free on public repos)
- ✅ **6-hour sync = 4 runs/day ≈ 12 minutes/month**

### Current Performance Metrics
- **Scraping Time**: ~35 seconds for 410 items
- **Poster Coverage**: 96% success rate
- **Content Detection**: 359 movies + 51 TV series
- **Cache Duration**: 60 seconds for Stremio, 30 minutes internal

---

## 🔄 Updating Your Addon

### Automatic Updates
- Code changes to `main` branch auto-deploy to Vercel
- No downtime during deployments
- Version auto-increments via `lib/version.ts`

### Manual Sync Trigger
```bash
# Trigger immediate sync (requires auth)
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json" \
  "https://your-app.vercel.app/api/cron/sync-watchlist"
```

### Version Management
- **Always increment** `ADDON_VERSION` in `lib/version.ts` when making changes
- Version appears in manifest and enables cache busting
- Stremio uses version for addon identification

---

## 🎯 Final Checklist

Before going live, ensure:

- [ ] **GitHub repo** is public and pushed
- [ ] **Vercel deployment** successful
- [ ] **Environment variables** configured in Vercel
- [ ] **GitHub secrets** configured for Actions
- [ ] **Manifest URL** returns valid JSON
- [ ] **Catalog endpoints** return movie/series data
- [ ] **Stremio installation** works with your manifest URL
- [ ] **First sync** completed successfully (check logs)

### Your Final URLs
After successful deployment:

**Manifest URL:**
```
https://your-app.vercel.app/api/stremio/ur31595220/manifest.json
```

**For other IMDb users (replace USER_ID):**
```
https://your-app.vercel.app/api/stremio/USER_ID/manifest.json
```

---

## 🆘 Support & Development

- **GitHub Issues**: Report bugs in your repository
- **Logs**: Check Vercel Functions and GitHub Actions for debugging
- **Testing**: All endpoints include error handling for Stremio compatibility
- **Development**: Use `npm run dev` for local testing on port 3002

---

**🎉 Your IMDb → Stremio addon is now live and auto-updating!**