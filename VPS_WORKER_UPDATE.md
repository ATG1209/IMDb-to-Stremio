# VPS Worker Update: Add Scraping Logic

Your VPS worker at `http://37.27.92.76:3003` needs the actual scraping logic. Here's what needs to be added:

## Current Status
- ✅ Basic Express server running
- ✅ Health endpoint working
- ❌ Jobs endpoint returns empty data

## Required Implementation

### 1. Update the Jobs Endpoint

Replace the current `/jobs` endpoint with this implementation:

```javascript
// In your VPS worker's jobs endpoint
app.post('/jobs', async (req, res) => {
  const { imdbUserId, forceRefresh = false } = req.body;

  if (!imdbUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing imdbUserId parameter'
    });
  }

  try {
    console.log(`[VPS Worker] Starting scrape for user ${imdbUserId}...`);

    // Launch Puppeteer browser
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920,1080'
      ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to IMDb watchlist
    const watchlistUrl = `https://www.imdb.com/user/${imdbUserId}/watchlist?ref_=up_nv_urwls_all`;
    console.log(`[VPS Worker] Navigating to ${watchlistUrl}`);

    await page.goto(watchlistUrl, { timeout: 45000, waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    // Enhanced scrolling for pagination
    console.log('[VPS Worker] Scrolling to load all items...');
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 25; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(800);
        const currentCount = Math.max(
          document.querySelectorAll('.lister-item').length,
          document.querySelectorAll('.ipc-poster-card').length,
          document.querySelectorAll('a[href*="/title/"]').length
        );
        if (i > 3 && currentCount > 0 && currentCount >= 200) {
          break;
        }
      }
      window.scrollTo(0, 0);
    });

    // Extract watchlist items
    const items = await page.evaluate(() => {
      const extractItems = () => {
        // Try different DOM structures
        const listerItems = Array.from(document.querySelectorAll('.lister-item')).map((el) => {
          try {
            const a = el.querySelector('h3 a[href*="/title/"]');
            const href = a ? a.getAttribute('href') : '';
            const id = href ? (href.match(/tt\\d+/) || [])[0] || '' : '';
            const title = a ? (a.textContent || '').trim() : '';
            const yearEl = el.querySelector('.lister-item-year, .secondaryInfo');
            const yearText = yearEl ? yearEl.textContent || '' : '';
            const year = (yearText.match(/(19|20)\\d{2}/) || [])[0];
            const img = el.querySelector('img[src]');
            const text = (el.textContent || '').toLowerCase();
            const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';

            return id && title ? {
              imdbId: id,
              title: title.replace(/^\\d+\\.\\s*/, '').replace(/\\s+/g, ' ').trim(),
              year,
              type,
              poster: img ? img.src : undefined,
              imdbRating: 0,
              numRatings: 0,
              runtime: 0,
              popularity: 0,
              userRating: 0,
              addedAt: new Date().toISOString()
            } : null;
          } catch (e) {
            return null;
          }
        }).filter(Boolean);

        // Fallback: extract from all title links
        const linkItems = Array.from(document.querySelectorAll('a[href*="/title/"]')).map((a) => {
          let id = '';
          if (a.href) {
            const match = a.href.match(/\\/title\\/(tt\\d+)/) || a.href.match(/(tt\\d+)/);
            id = match ? match[1] : '';
          }

          let title = (a.textContent || '').trim();
          title = title.replace(/^\\d+\\.\\s*/, '').replace(/\\s+/g, ' ').trim();

          if (!id || !title || title.length < 3) return null;

          const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"]');
          let year = null;
          if (parent) {
            const parentText = parent.textContent || '';
            const yearMatch = parentText.match(/\\(?(19|20)\\d{2}\\)?/);
            year = yearMatch ? yearMatch[0].replace(/[()]/g, '') : null;
          }

          const contextText = parent ? (parent.textContent || '').toLowerCase() : '';
          const type = contextText.includes('series') || contextText.includes('tv') ? 'tv' : 'movie';

          return {
            imdbId: id,
            title,
            year,
            type,
            poster: undefined,
            imdbRating: 0,
            numRatings: 0,
            runtime: 0,
            popularity: 0,
            userRating: 0,
            addedAt: new Date().toISOString()
          };
        }).filter(Boolean);

        // Remove duplicates from linkItems
        const uniqueLinks = linkItems.reduce((acc, current) => {
          if (current && !acc.find(item => item.imdbId === current.imdbId)) {
            acc.push(current);
          }
          return acc;
        }, []);

        // Choose the method that gives us the most items
        return listerItems.length > uniqueLinks.length ? listerItems : uniqueLinks;
      };

      return extractItems();
    });

    await browser.close();

    console.log(`[VPS Worker] Scraped ${items.length} items for user ${imdbUserId}`);

    // Enhance with TMDB data if API key available
    if (process.env.TMDB_API_KEY && items.length > 0) {
      console.log(`[VPS Worker] Enhancing ${items.length} items with TMDB data...`);

      // Simple TMDB enhancement (basic implementation)
      for (let i = 0; i < Math.min(items.length, 20); i++) { // Limit to first 20 for speed
        const item = items[i];
        try {
          const tmdbUrl = `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(item.title)}${item.year ? `&year=${item.year}` : ''}`;
          const tmdbResponse = await fetch(tmdbUrl);
          const tmdbData = await tmdbResponse.json();

          if (tmdbData.results && tmdbData.results.length > 0) {
            const result = tmdbData.results[0];
            if (result.poster_path) {
              item.poster = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
            }
            if (result.media_type) {
              item.type = result.media_type === 'tv' ? 'tv' : 'movie';
            }
          }

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (tmdbError) {
          console.warn(`[VPS Worker] TMDB failed for ${item.title}:`, tmdbError);
        }
      }
    }

    return res.json({
      success: true,
      data: items,
      totalItems: items.length,
      lastUpdated: new Date().toISOString(),
      source: 'vps-worker'
    });

  } catch (error) {
    console.error(`[VPS Worker] Scraping failed for user ${imdbUserId}:`, error);
    return res.status(500).json({
      success: false,
      error: 'Scraping failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

### 2. Install Required Dependencies

SSH into your VPS and run:

```bash
cd /path/to/your/worker  # Navigate to your worker directory
npm install puppeteer
# puppeteer should already be installed, but just in case
```

### 3. Verify Environment Variables

Make sure these are set in your VPS worker:

```bash
TMDB_API_KEY=09a2e4b535394bb6a9e1d248cf87d5ac
NODE_ENV=production
```

### 4. Test the Updated Worker

After implementing the above:

```bash
# Test from your VPS
curl -X POST http://localhost:3003/jobs \
  -H "Content-Type: application/json" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'

# Test from external
curl -X POST http://37.27.92.76:3003/jobs \
  -H "Content-Type: application/json" \
  -d '{"imdbUserId": "ur31595220", "forceRefresh": true}'
```

This should return actual scraped data instead of empty arrays.

## Expected Output

After implementation, the worker should return:

```json
{
  "success": true,
  "data": [
    {
      "imdbId": "tt1234567",
      "title": "Movie Title",
      "year": "2023",
      "type": "movie",
      "poster": "https://image.tmdb.org/t/p/w500/poster.jpg",
      "addedAt": "2025-01-17T12:00:00.000Z"
    }
    // ... more items
  ],
  "totalItems": 250,
  "lastUpdated": "2025-01-17T12:00:00.000Z",
  "source": "vps-worker"
}
```

Once this is implemented, your Vercel app will be able to get real data from the VPS worker!