# Deployment Issue: Browser Automation in Serverless Environments

## Issue Summary

**Problem**: IMDb watchlist scraping works perfectly in local development but fails when deployed to Vercel's serverless environment.

**Root Cause**: Fundamental incompatibility between browser automation requirements and serverless environment limitations.

**Status**: Addon infrastructure fully functional, scraping blocked by serverless constraints.

## Timeline of Issue

### Phase 1: Initial Deployment Success
- ✅ Next.js application deployed successfully to Vercel
- ✅ Stremio manifest endpoints working correctly
- ✅ Environment variables configured (TMDB_API_KEY, DEFAULT_IMDB_USER_ID)
- ✅ Addon installable in Stremio client
- ❌ Sync endpoint returning 0 items instead of expected 410+ items

### Phase 2: Playwright Installation Attempts
**Error**: `browserType.launch: Executable doesn't exist`
```
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
╚═════════════════════════════════════════════════════════════════════════╝
```

**Attempted Fix**: Added postbuild script to install Playwright browsers
```json
"postbuild": "npx playwright install chromium --with-deps"
```

**Result**: Failed with `apt-get: command not found` - Vercel environment lacks package managers.

### Phase 3: Migration to Puppeteer
**Rationale**: Puppeteer generally has better serverless compatibility than Playwright.

**Changes Made**:
- Replaced `import { chromium } from 'playwright'` with `import puppeteer from 'puppeteer'`
- Updated browser launch API calls
- Modified page creation and navigation methods
- Removed Playwright dependencies from package.json

**Error**: `Could not find Chrome (ver. 131.0.6778.204)`
```
This can occur if either
1. you did not perform an installation before running the script
2. your cache path is incorrectly configured
```

### Phase 4: Chrome Installation Attempts
**Attempted Fix**: Puppeteer browser installation
```json
"postbuild": "npx puppeteer browsers install chrome"
```

**Error**: Still missing Chrome executable in serverless runtime.

### Phase 5: chrome-aws-lambda Integration
**Rationale**: chrome-aws-lambda is specifically designed for AWS Lambda/serverless environments.

**Implementation**:
```typescript
import chromium from 'chrome-aws-lambda';

if (isProduction) {
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });
}
```

**Final Error**: Missing system libraries
```
/tmp/chromium: error while loading shared libraries:
libnss3.so: cannot open shared object file: No such file or directory
```

## Technical Analysis

### Local Environment (Working)
```
OS: macOS/Linux with full system libraries
Browser: Native Chrome/Chromium installation
Dependencies: Complete system library stack
- libnss3.so ✅
- libatk-1.0.so ✅
- libgtk-3.so ✅
- libX11.so ✅
- And 50+ other libraries ✅

Memory: Unlimited
Execution Time: Unlimited
File System: Full read/write access
Package Management: brew/apt/yum available
```

### Vercel Serverless (Failing)
```
Runtime: AWS Lambda Amazon Linux 2
Base Image: Minimal Node.js runtime
Browser: None pre-installed
Dependencies: Essential libraries only
- libnss3.so ❌
- libatk-1.0.so ❌
- libgtk-3.so ❌
- libX11.so ❌
- Missing 50+ GUI libraries ❌

Memory: 1GB limit
Execution Time: 10s limit (Hobby plan)
File System: Read-only except /tmp
Package Management: None available (no apt-get, yum)
```

### Why chrome-aws-lambda Failed
Even though chrome-aws-lambda includes a pre-compiled Chromium binary for Lambda, it still requires system libraries that Vercel's runtime doesn't provide:

1. **NSS Libraries**: Network Security Services (`libnss3.so`)
2. **ATK Libraries**: Accessibility Toolkit (`libatk-1.0.so`)
3. **GTK Libraries**: GIMP Toolkit (`libgtk-3.so`)
4. **X11 Libraries**: X Window System (`libX11.so`)

These are fundamental GUI and security libraries that browsers need to operate, even in headless mode.

## Code Evolution

### Version 1.31.0: Original Playwright
```typescript
import { chromium } from 'playwright';

browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### Version 1.32.0-1.34.0: Puppeteer Migration
```typescript
import puppeteer from 'puppeteer';

browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
```

### Version 1.35.0: Enhanced Puppeteer Config
```typescript
const launchOptions = {
  executablePath: process.env.NODE_ENV === 'production'
    ? await puppeteer.executablePath()
    : undefined,
  args: [...] // Extended args list
};
```

### Version 1.36.0: chrome-aws-lambda Integration
```typescript
import chromium from 'chrome-aws-lambda';

if (isProduction) {
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
  });
}
```

## Error Log Progression

### 1. Playwright Missing Executable
```
browserType.launch: Executable doesn't exist at
/home/sbx_user1051/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell
```

### 2. Playwright Installation Failed
```
E: Unable to locate package libnss3-dev
apt-get: command not found
```

### 3. Puppeteer Missing Chrome
```
Error: Could not find Chrome (ver. 131.0.6778.204).
This can occur if either
1. you did not perform an installation before running the script
2. your cache path is incorrectly configured (/home/sbx_user1051/.cache/puppeteer)
```

### 4. chrome-aws-lambda Library Missing
```
Error: Failed to launch the browser process!
/tmp/chromium: error while loading shared libraries:
libnss3.so: cannot open shared object file: No such file or directory
```

## Impact Assessment

### What Works ✅
- **Manifest Serving**: All Stremio manifest endpoints functional
- **API Infrastructure**: Next.js API routes working correctly
- **Environment Config**: TMDB integration and user settings
- **Addon Installation**: Users can install addon in Stremio
- **Local Development**: Full functionality in development environment
- **Static Content**: All non-scraping features operational

### What Fails ❌
- **IMDb Scraping**: Cannot launch browser in serverless environment
- **Watchlist Sync**: Returns 0 items instead of 410+ expected
- **Automated Updates**: Cron-based sync non-functional
- **Real-time Data**: Addon shows empty content to users

### Business Impact
- **User Experience**: Addon appears broken (shows "EmptyContent")
- **Core Feature**: Primary value proposition (watchlist sync) non-functional
- **Scalability**: Cannot serve multiple users simultaneously
- **Reliability**: Infrastructure sound, but key feature blocked

## Attempted Solutions Summary

| Approach | Technology | Result | Reason for Failure |
|----------|------------|--------|-------------------|
| Native Playwright | playwright | ❌ | No browser executable |
| Browser Installation | npx playwright install | ❌ | No package manager |
| Puppeteer Migration | puppeteer | ❌ | Missing Chrome binary |
| Puppeteer Install | npx puppeteer browsers install | ❌ | Runtime vs build mismatch |
| Serverless Chrome | chrome-aws-lambda | ❌ | Missing system libraries |

## Alternative Solutions

### 1. External Browser Services
- **Browserless.io**: Managed browser automation API
- **ScrapingBee**: Web scraping service with rotating proxies
- **Puppeteer Cluster**: Self-hosted browser pool

### 2. Different Deployment Targets
- **Railway**: Full VM-like environment with system packages
- **Render**: More permissive container environment
- **DigitalOcean App Platform**: Supports Docker containers
- **Traditional VPS**: Full control over system dependencies

### 3. Hybrid Architecture
- **Serverless API**: Keep Next.js on Vercel for speed
- **Separate Scraper**: Deploy browser automation to different service
- **Message Queue**: Coordinate between services via Redis/PostgreSQL

### 4. API-Based Alternatives
- **IMDb Official API**: If available (currently not public)
- **Third-party Services**: Watchlist sync services
- **Browser Extension**: Client-side data extraction

### 5. Manual Workflow
- **CSV Import**: User exports watchlist manually
- **File Upload**: Process IMDb export files
- **Guided Setup**: Step-by-step user instructions

## Recommended Next Steps

### Option A: External Browser Service (Fastest)
1. Sign up for Browserless.io or similar service
2. Update `fetchWatchlist` to use remote browser API
3. Keep all existing Vercel infrastructure
4. **Pros**: Minimal code changes, reliable
5. **Cons**: Additional monthly cost ($10-50/month)

### Option B: Railway Deployment (Most Control)
1. Create Railway project with Node.js + Chrome
2. Deploy entire application to Railway
3. Point domain to Railway instead of Vercel
4. **Pros**: Full control, same codebase
5. **Cons**: Migration effort, potentially slower

### Option C: Hybrid Architecture (Most Scalable)
1. Keep Stremio API on Vercel (fast global CDN)
2. Deploy scraper to Railway/Render
3. Use database/queue for communication
4. **Pros**: Best of both worlds
5. **Cons**: Increased complexity

### Option D: Manual Import (Immediate Solution)
1. Build CSV import functionality
2. Provide user instructions for IMDb export
3. Keep automated sync as future enhancement
4. **Pros**: Works immediately, no external dependencies
5. **Cons**: Manual process for users

## Current Working State

**Deployment URL**: https://imdb-migrator.vercel.app

**Working Endpoints**:
- ✅ `GET /api/stremio/ur31595220/manifest.json` - User manifest
- ✅ `GET /api/stremio/manifest.json` - Generic manifest
- ✅ `GET /api/sync` - Sync status (returns empty due to scraping issue)
- ❌ `POST /api/sync` - Manual sync (fails at browser launch)

**Stremio Installation**:
- Manifest URL: `https://imdb-migrator.vercel.app/api/stremio/ur31595220/manifest.json?v=1.36.0`
- Status: Installable but shows EmptyContent due to scraping failure

## Conclusion

This is a classic "works on my machine" scenario where local development success doesn't translate to serverless production. The issue isn't with our code quality or approach - it's a fundamental architectural mismatch between browser automation requirements and serverless environment constraints.

The deployment demonstrates that our Next.js application, API structure, and Stremio integration are all working perfectly. The only blocker is the browser automation component, which can be resolved through one of the alternative approaches outlined above.

**Recommendation**: Proceed with Option A (External Browser Service) for fastest resolution, or Option D (Manual Import) for immediate user value while planning longer-term solution.