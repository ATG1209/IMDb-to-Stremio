# 🚀 IMDb to Stremio Addon - Deployment Guide

## 📋 Overview

This guide covers deploying your IMDb Watchlist to Stremio addon on **Vercel** with automatic sync every **6 hours**.

### ✨ What You Get

- **🎬 Complete Stremio Addon**: Movies + TV Series from your IMDb watchlist
- **🔄 Auto-sync**: Updates every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
- **🌐 Global CDN**: Fast worldwide access via Vercel
- **💰 100% Free**: No hosting costs
- **🔒 Secure**: Environment variables for API keys

---

## 🛠️ Deployment Steps

### 1. **Get Your TMDB API Key**

1. Go to [TMDB API](https://www.themoviedb.org/settings/api)
2. Create account → Request API key
3. Copy your API key (starts with `eyJ...` or similar)

### 2. **Deploy to Vercel**

#### Option A: One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FATG1209%2FIMBd-to-Stremio)

#### Option B: Manual Deploy
1. Fork this repository
2. Connect your GitHub to [Vercel](https://vercel.com)
3. Import your forked repo
4. Deploy!

### 3. **Configure Environment Variables**

In Vercel dashboard → Settings → Environment Variables:

```env
TMDB_API_KEY=your_tmdb_api_key_here
DEFAULT_IMDB_USER_ID=ur31595220
CRON_SECRET=random_secret_string_123
```

**Generate a secure CRON_SECRET:**
```bash
# Use this command or any random string generator
openssl rand -base64 32
```

### 4. **Setup GitHub Actions (Auto-sync)**

1. Go to your GitHub repo → Settings → Secrets
2. Add these secrets:

```
CRON_SECRET = same_value_as_vercel
VERCEL_APP_URL = https://your-app.vercel.app
```

### 5. **Test Your Deployment**

Visit these URLs to verify:

- **Manifest**: `https://your-app.vercel.app/api/stremio/ur31595220/manifest.json`
- **Movies**: `https://your-app.vercel.app/api/stremio/ur31595220/catalog/movie/imdb-watchlist`
- **Series**: `https://your-app.vercel.app/api/stremio/ur31595220/catalog/series/imdb-watchlist`

---

## 📱 Installing in Stremio

### Step 1: Copy Manifest URL
```
https://your-app.vercel.app/api/stremio/ur31595220/manifest.json
```

### Step 2: Add to Stremio
1. Open **Stremio**
2. Go to **🧩 Addons**
3. Click **📋 Addon Repository URL**
4. Paste your manifest URL
5. Click **Install**

### Step 3: Enjoy!
- Browse **🎬 Movies** and **📺 Series** tabs
- Your IMDb watchlist items appear with posters
- Updates automatically every 6 hours

---

## 🔧 Configuration Options

### Sync Frequency
Current: Every 6 hours (`0 */6 * * *`)

To change frequency, edit `.github/workflows/sync.yml`:
```yaml
schedule:
  - cron: '0 */12 * * *'  # Every 12 hours
  - cron: '0 0 * * *'     # Daily at midnight
```

### Custom User ID
To use a different IMDb user:
1. Update `DEFAULT_IMDB_USER_ID` in Vercel
2. Change manifest URL: `/api/stremio/ur12345678/manifest.json`

---

## 🐛 Troubleshooting

### Addon Not Loading in Stremio
- ✅ Check manifest URL returns JSON
- ✅ Verify HTTPS (not HTTP)
- ✅ Test in browser first

### No Items Showing
- ✅ Check TMDB_API_KEY is set
- ✅ Verify IMDb user ID format (`ur` + numbers)
- ✅ Wait for first sync (may take 5-10 minutes)

### Sync Not Working
- ✅ Check GitHub Actions tab for errors
- ✅ Verify CRON_SECRET matches in both places
- ✅ Test manual sync: `POST /api/cron/sync-watchlist`

### Check Logs
Vercel → Functions → Recent Invocations

---

## 📊 Performance & Limits

### Vercel Free Tier
- ✅ **100GB bandwidth/month** (plenty for personal use)
- ✅ **1000 serverless executions/day** (more than enough)
- ✅ **10-second function timeout** (may timeout on very large lists)

### GitHub Actions
- ✅ **2000 minutes/month** (free on public repos)
- ✅ **6-hour sync = 4 runs/day = ~12 minutes/month**

### Optimization Tips
- Cache lasts 30 minutes between fetches
- TMDB requests are batched and rate-limited
- Only processes movie/series content types

---

## 🔄 Updating Your Addon

### Manual Update
1. Git pull latest changes
2. Vercel auto-deploys from `main` branch
3. No downtime!

### Version Management
Version is automatically incremented in `lib/version.ts`

---

## 🎯 Final URLs

After deployment, your addon URLs will be:

**For Your Personal Use:**
```
https://your-app.vercel.app/api/stremio/ur31595220/manifest.json
```

**For Other Users:**
```
https://your-app.vercel.app/api/stremio/USER_ID/manifest.json
```

Replace `USER_ID` with any IMDb user ID (format: `ur` + numbers).

---

## 🆘 Support

- **GitHub Issues**: [Report bugs here](https://github.com/ATG1209/IMBd-to-Stremio/issues)
- **Documentation**: This README + inline code comments
- **Testing**: All endpoints include error handling for Stremio compatibility

---

**🎉 Enjoy your automated IMDb → Stremio experience!**