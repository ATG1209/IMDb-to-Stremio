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
    version: '2.3.4',
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

    // BREAKTHROUGH PAGINATION STRATEGY: Multi-page extraction (v2.3.4)
    const urlConfigs = [
      {
        name: 'page-1-newest',
        url: `https://www.imdb.com/user/${imdbUserId}/watchlist?sort=created:desc&view=detail`,
      },
      {
        name: 'page-2-newest',
        url: `https://www.imdb.com/user/${imdbUserId}/watchlist?sort=created:desc&view=detail&page=2`,
      }
    ];

    let allItems = [];
    const seenIds = new Set();

    console.log(`[VPS Worker] BREAKTHROUGH: Multi-page extraction to overcome 250-item limit`);

    // Process each page for complete coverage
    for (const config of urlConfigs) {
      try {
        console.log(`[VPS Worker] Processing ${config.name}: ${config.url}`);
        await page.goto(config.url, { timeout: 30000, waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check for 403 and handle
        const pageContent = await page.content();
        if (pageContent.includes('403') || pageContent.includes('Forbidden')) {
          console.log(`[VPS Worker] 403 detected on ${config.name}, skipping...`);
          continue;
        }

        // OPTIMIZED SCROLLING: Faster performance (v2.3.4)
        console.log(`[VPS Worker] Scrolling ${config.name} page...`);
        await page.evaluate(async () => {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          let previousCount = 0;
          let stableCount = 0;

          // Optimized scrolling with faster performance
          for (let i = 0; i < 25; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(800); // Optimized delay

            const currentCount = document.querySelectorAll('a[href*="/title/"]').length;
            console.log(`[SCROLL ${i + 1}] Current title links: ${currentCount}`);

            if (currentCount === previousCount) {
              stableCount++;
              if (stableCount >= 3) {
                console.log(`[SCROLL COMPLETE] No new items for 3 rounds, stopping at ${currentCount} items`);
                break;
              }
            } else {
              stableCount = 0;
            }
            previousCount = currentCount;

            // Early exit optimization
            if (currentCount >= 250 && i > 10) {
              console.log(`[SCROLL OPTIMIZATION] Found ${currentCount} items, checking for stability...`);
              await sleep(300);
            }
          }

          // Optimized DOM stabilization
          console.log('[DOM STABILIZATION] Waiting for DOM to fully stabilize...');
          await sleep(2000);
          window.scrollTo(0, 0);
          await sleep(1500);
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

        // Strategy 2: Enhanced extraction from ALL title links (targeting 501+ items)
        const allLinks = Array.from(document.querySelectorAll('a[href*="/title/"]'));
        console.log(`Found ${allLinks.length} total title links on page`);

        const linkItems = allLinks.map((a, index) => {
          let id = '';
          if (a.href) {
            const match = a.href.match(/\/title\/(tt\d+)/) || a.href.match(/(tt\d+)/);
            id = match ? match[1] : '';
          }

          let title = (a.textContent || '').trim();
          // Enhanced title cleaning from context docs
          title = title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

          // CRITICAL: Ultra-lenient filtering for items 251+ (from pagination docs)
          // Items 251-501 exist as minimal <a> tags without rich metadata
          if (!id) return null; // Only require IMDb ID, accept empty/minimal titles

          // Enhanced parent context detection
          const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"], .lister-item, .ipc-poster-card, [data-testid]');
          let year = null;
          if (parent) {
            const parentText = parent.textContent || '';
            const yearMatch = parentText.match(/\(?(19|20)\d{2}\)?/);
            year = yearMatch ? yearMatch[0].replace(/[()]/g, '') : null;
          }

          // Enhanced type detection
          const contextText = (parent ? parent.textContent : '') + ' ' + (a.getAttribute('aria-label') || '');
          const type = contextText.toLowerCase().includes('series') ||
                      contextText.toLowerCase().includes('tv') ||
                      contextText.toLowerCase().includes('season') ? 'tv' : 'movie';

          // Debug logging for items after 250 threshold
          if (index >= 250 && index < 260) {
            console.log(`Item ${index + 1}: "${title}" (${id}) - Type: ${type}`);
          }

          return {
            imdbId: id,
            title: title || `Movie ${id}`, // Fallback title for items 251+ (from pagination docs)
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

        // Enhanced deduplication preserving order
        const seenIds = new Set();
        const uniqueLinks = linkItems.filter(item => {
          if (seenIds.has(item.imdbId)) {
            return false;
          }
          seenIds.add(item.imdbId);
          return true;
        });

        console.log(`Extraction results - Lister: ${listerItems.length}, Unique Links: ${uniqueLinks.length}`);
        console.log(`Breakthrough check: Links beyond 250: ${uniqueLinks.length - 250}`);

        // Enhanced diagnostics from pagination docs
        if (uniqueLinks.length > 250) {
          console.log(`Sample titles from positions 1-5:`, uniqueLinks.slice(0, 5).map(x => x.title));
          console.log(`Sample titles from positions 245-255:`, uniqueLinks.slice(244, 254).map(x => x.title));
          console.log(`Sample titles from positions 495-501:`, uniqueLinks.slice(494, 501).map(x => x.title));
        }

        // CRITICAL: Always prefer the link extraction method for maximum coverage
        // This addresses the 250-item limit from the pagination issue docs
        return uniqueLinks.length > listerItems.length ? uniqueLinks : listerItems;
      };

      return extractItems();
    });

    await browser.close();

    console.log(`[VPS Worker] Scraped ${items.length} items for user ${imdbUserId}`);

    // Enhanced TMDB integration with batch processing (based on context docs)
    if (process.env.TMDB_API_KEY && items.length > 0) {
      console.log(`[VPS Worker] Enhancing ${items.length} items with TMDB data...`);

      // Enhanced TMDB processing - focus on movies first, increased limit
      const enhanceLimit = Math.min(items.length, 120); // Increased from 60
      const movieItems = items.filter(item => item.type === 'movie').slice(0, enhanceLimit);
      const tvItems = items.filter(item => item.type === 'tv').slice(0, Math.min(20, enhanceLimit - movieItems.length));
      const itemsToEnhance = [...movieItems, ...tvItems];

      console.log(`[VPS Worker] Processing ${itemsToEnhance.length} items (${movieItems.length} movies, ${tvItems.length} TV)`);

      // Batch processing for better performance
      const batchSize = 15; // From context docs
      for (let i = 0; i < itemsToEnhance.length; i += batchSize) {
        const batch = itemsToEnhance.slice(i, i + batchSize);
        console.log(`[VPS Worker] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(itemsToEnhance.length/batchSize)}`);

        await Promise.all(batch.map(async (item, index) => {
          try {
            // Delay within batch to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, index * 50));

            const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(item.title)}${item.year ? `&year=${item.year}` : ''}`;
            const searchResponse = await fetch(searchUrl);
            const searchData = await searchResponse.json();

            if (searchData.results && searchData.results.length > 0) {
              const result = searchData.results[0];

              // Enhanced poster handling
              if (result.poster_path) {
                item.poster = `https://image.tmdb.org/t/p/w500${result.poster_path}`;
              }

              // Enhanced metadata from context docs
              if (result.media_type) {
                item.type = result.media_type === 'tv' ? 'tv' : 'movie';
              }

              // Additional metadata enhancement
              if (result.vote_average) {
                item.imdbRating = result.vote_average;
              }
              if (result.vote_count) {
                item.numRatings = result.vote_count;
              }
              if (result.popularity) {
                item.popularity = result.popularity;
              }

              // Get detailed info for runtime (movies only)
              if (item.type === 'movie' && result.id) {
                try {
                  const detailUrl = `https://api.themoviedb.org/3/movie/${result.id}?api_key=${process.env.TMDB_API_KEY}`;
                  const detailResponse = await fetch(detailUrl);
                  const detailData = await detailResponse.json();

                  if (detailData.runtime) {
                    item.runtime = detailData.runtime;
                  }
                } catch (detailError) {
                  // Silent fail for detail requests
                }
              }
            }
          } catch (tmdbError) {
            console.warn(`[VPS Worker] TMDB failed for ${item.title}:`, tmdbError.message);
          }
        }));

        // Delay between batches
        if (i + batchSize < itemsToEnhance.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const enhancedCount = items.filter(item => item.poster || item.imdbRating > 0).length;
      console.log(`[VPS Worker] Enhanced ${enhancedCount}/${items.length} items with TMDB data`);
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