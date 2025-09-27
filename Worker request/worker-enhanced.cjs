const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = 3003;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    service: 'vps-worker'
  });
});

// Jobs endpoint with real IMDb scraping
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
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
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

    // Check if we got 403 Forbidden, switch to grid view
    const pageContent = await page.content();
    if (pageContent.includes('403') || pageContent.includes('Forbidden') || pageContent.includes('blocked')) {
      console.log('[VPS Worker] 403 detected, switching to grid view...');
      const gridUrl = `https://www.imdb.com/user/${imdbUserId}/watchlist?view=grid`;
      await page.goto(gridUrl, { timeout: 45000, waitUntil: 'networkidle2' });
      await page.waitForTimeout(2000);
    }

    // Enhanced scrolling for pagination
    console.log('[VPS Worker] Scrolling to load all items...');
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      let previousCount = 0;
      let stableCount = 0;

      for (let i = 0; i < 25; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(800);

        const currentCount = Math.max(
          document.querySelectorAll('.lister-item').length,
          document.querySelectorAll('.ipc-poster-card').length,
          document.querySelectorAll('a[href*="/title/"]').length
        );

        console.log(`Scroll ${i + 1}: Found ${currentCount} items`);

        if (currentCount === previousCount) {
          stableCount++;
          if (stableCount >= 3) {
            console.log('Item count stable, stopping scroll');
            break;
          }
        } else {
          stableCount = 0;
        }

        previousCount = currentCount;

        // Break if we have a good number of items and haven't seen growth
        if (i > 10 && currentCount > 200 && stableCount >= 2) {
          break;
        }
      }

      window.scrollTo(0, 0);
    });

    // Extract watchlist items with multiple strategies
    const items = await page.evaluate(() => {
      const extractItems = () => {
        // Strategy 1: Try structured lister items first
        const listerItems = Array.from(document.querySelectorAll('.lister-item')).map((el) => {
          try {
            const a = el.querySelector('h3 a[href*="/title/"], .titleColumn a[href*="/title/"]');
            const href = a ? a.getAttribute('href') : '';
            const id = href ? (href.match(/tt\d+/) || [])[0] || '' : '';
            const title = a ? (a.textContent || '').trim() : '';

            const yearEl = el.querySelector('.lister-item-year, .secondaryInfo, .titleColumn .secondaryInfo');
            const yearText = yearEl ? yearEl.textContent || '' : '';
            const year = (yearText.match(/(19|20)\d{2}/) || [])[0];

            const img = el.querySelector('img[src]');
            const text = (el.textContent || '').toLowerCase();
            const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';

            return id && title ? {
              imdbId: id,
              title: title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim(),
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
            console.error('Error extracting lister item:', e);
            return null;
          }
        }).filter(Boolean);

        // Strategy 2: Extract from all title links as fallback
        const linkItems = Array.from(document.querySelectorAll('a[href*="/title/"]')).map((a) => {
          let id = '';
          if (a.href) {
            const match = a.href.match(/\/title\/(tt\d+)/) || a.href.match(/(tt\d+)/);
            id = match ? match[1] : '';
          }

          let title = (a.textContent || '').trim();
          title = title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

          if (!id || !title || title.length < 3) return null;

          const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"], .lister-item');
          let year = null;
          if (parent) {
            const parentText = parent.textContent || '';
            const yearMatch = parentText.match(/\(?(19|20)\d{2}\)?/);
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

        console.log(`Extraction results - Lister: ${listerItems.length}, Links: ${uniqueLinks.length}`);

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

      // Simple TMDB enhancement (limit to first 60 for performance)
      const enhanceLimit = Math.min(items.length, 60);
      for (let i = 0; i < enhanceLimit; i++) {
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

      console.log(`[VPS Worker] Enhanced ${enhanceLimit} items with TMDB data`);
    }

    return res.json({
      success: true,
      data: items,
      totalItems: items.length,
      lastUpdated: new Date().toISOString(),
      source: 'vps-worker',
      enhanced: process.env.TMDB_API_KEY ? true : false
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

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`[VPS Worker] Server running on port ${port}`);
  console.log(`[VPS Worker] Health check: http://localhost:${port}/health`);
  console.log(`[VPS Worker] Jobs endpoint: http://localhost:${port}/jobs`);
  console.log(`[VPS Worker] TMDB API Key: ${process.env.TMDB_API_KEY ? 'Configured' : 'Not configured'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('[VPS Worker] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[VPS Worker] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});