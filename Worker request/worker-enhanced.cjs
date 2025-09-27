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

  const startTime = Date.now();

  try {
    console.log(`[VPS Worker] Starting breakthrough scrape for user ${imdbUserId}...`);

    // Enhanced browser launch with error handling
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--window-size=1920,1080',
          '--disable-extensions',
          '--disable-plugins',
          '--disable-default-apps',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });
    } catch (browserError) {
      console.error('[VPS Worker] Browser launch failed:', browserError.message);
      return res.status(500).json({
        success: false,
        error: 'Browser initialization failed',
        message: browserError.message,
        timestamp: new Date().toISOString()
      });
    }

    const page = await browser.newPage();

    // Enhanced stealth configuration for VPS
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');

    // Additional headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    });

    // Override navigator properties to avoid detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

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

        // Enhanced navigation with retries
        let navigationSuccess = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            await page.goto(config.url, {
              timeout: 30000,
              waitUntil: 'networkidle2'
            });
            navigationSuccess = true;
            break;
          } catch (navError) {
            console.log(`[VPS Worker] Navigation attempt ${attempt} failed for ${config.name}:`, navError.message);
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
          }
        }

        if (!navigationSuccess) {
          console.log(`[VPS Worker] All navigation attempts failed for ${config.name}`);
          continue;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        // Enhanced 403 handling with fallback strategies
        const pageContent = await page.content();
        if (pageContent.includes('403') || pageContent.includes('Forbidden') || pageContent.includes('Access Denied')) {
          console.log(`[VPS Worker] Access denied on ${config.name}, trying fallback strategies...`);

          // Try grid view as fallback
          if (config.url.includes('view=detail')) {
            const gridUrl = config.url.replace('view=detail', 'view=grid');
            console.log(`[VPS Worker] Trying grid view fallback: ${gridUrl}`);
            try {
              await page.goto(gridUrl, { timeout: 20000, waitUntil: 'networkidle2' });
              const gridContent = await page.content();
              if (gridContent.includes('403') || gridContent.includes('Forbidden')) {
                console.log(`[VPS Worker] Grid view also blocked, skipping ${config.name}`);
                continue;
              }
            } catch (fallbackError) {
              console.log(`[VPS Worker] Fallback failed for ${config.name}:`, fallbackError.message);
              continue;
            }
          } else {
            continue;
          }
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

        // BREAKTHROUGH EXTRACTION: Pre-filtering + Enhanced extraction (v2.3.4)
        const pageItems = await page.evaluate(() => {
          const allLinks = Array.from(document.querySelectorAll('a[href*="/title/"]'));
          console.log(`[VPS PHASE 1] Found ${allLinks.length} total title links`);

          // BREAKTHROUGH: Pre-filter empty links to eliminate duplicates
          const filteredLinks = allLinks.filter((a, index) => {
            const text = (a.textContent || '').trim();
            const hasMeaningfulText = text &&
              text.length > 0 &&
              !text.match(/^(tt\d+|View title|›|\s*)$/) &&
              text.length > 2;

            // Log filtering decisions for first/last few items
            if (index < 10 || index > allLinks.length - 10) {
              console.log(`[VPS FILTER ${index + 1}] "${text}" → ${hasMeaningfulText ? 'KEEP' : 'SKIP'}`);
            }

            return hasMeaningfulText;
          });

          console.log(`[VPS PRE-FILTER] Reduced from ${allLinks.length} links to ${filteredLinks.length} links with meaningful text`);

          // Enhanced extraction from filtered links
          const extractedItems = filteredLinks.map((a, index) => {
            try {
              let id = '';
              if (a.href) {
                const match = a.href.match(/\/title\/(tt\d+)/) || a.href.match(/(tt\d+)/);
                id = match ? match[1] : '';
              }

              let title = (a.textContent || '').trim();
              // Enhanced title cleaning
              title = title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

              // Only require IMDb ID for items 251+ (minimal metadata available)
              if (!id) return null;

              // Enhanced parent context detection for metadata
              const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"], .lister-item, .ipc-poster-card, [data-testid]');
              let year = null;
              if (parent) {
                const parentText = parent.textContent || '';
                const yearMatch = parentText.match(/\(?(19|20)\d{2}\)?/);
                year = yearMatch ? yearMatch[0].replace(/[()]/g, '') : null;
              }

              // Enhanced type detection from context
              const contextText = (parent ? parent.textContent : '') + ' ' + (a.getAttribute('aria-label') || '');
              const type = contextText.toLowerCase().includes('series') ||
                          contextText.toLowerCase().includes('tv') ||
                          contextText.toLowerCase().includes('season') ? 'tv' : 'movie';

              // Debug logging for items after 250 threshold
              if (index >= 250 && index < 260) {
                console.log(`[VPS Item ${index + 1}] "${title}" (${id}) - Type: ${type}`);
              }

              return {
                imdbId: id,
                title: title || `Movie ${id}`, // Fallback for items 251+
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
            } catch (e) {
              console.error('[VPS] Error extracting item:', e);
              return null;
            }
          }).filter(Boolean);

          // Enhanced deduplication preserving chronological order
          const seenIds = new Set();
          const uniqueItems = extractedItems.filter(item => {
            if (seenIds.has(item.imdbId)) {
              return false;
            }
            seenIds.add(item.imdbId);
            return true;
          });

          console.log(`[VPS EXTRACTION] Pre-filter: ${allLinks.length} → ${filteredLinks.length} → ${extractedItems.length} → ${uniqueItems.length} unique items`);

          // Enhanced diagnostics for breakthrough verification
          if (uniqueItems.length > 250) {
            console.log(`[VPS BREAKTHROUGH] Found ${uniqueItems.length} items (${uniqueItems.length - 250} beyond 250 limit)`);
            console.log(`[VPS SAMPLE 1-5]:`, uniqueItems.slice(0, 5).map(x => x.title));
            console.log(`[VPS SAMPLE 245-255]:`, uniqueItems.slice(244, 254).map(x => x.title));
            if (uniqueItems.length > 400) {
              console.log(`[VPS SAMPLE 400+]:`, uniqueItems.slice(399, 410).map(x => x.title));
            }
          }

          return uniqueItems;
        });

        // Add extracted items to collection with deduplication
        let newItemsCount = 0;
        for (const item of pageItems) {
          if (!seenIds.has(item.imdbId)) {
            seenIds.add(item.imdbId);
            allItems.push(item);
            newItemsCount++;
          }
        }

        console.log(`[VPS Worker] ${config.name}: Extracted ${pageItems.length} items, added ${newItemsCount} new items (total: ${allItems.length})`);

      } catch (error) {
        console.error(`[VPS Worker] Error processing ${config.name}:`, error.message);

        // Specific error handling for common issues
        if (error.message.includes('timeout')) {
          console.log(`[VPS Worker] ${config.name} timed out, trying reduced timeout...`);
          try {
            await page.goto(config.url, { timeout: 15000, waitUntil: 'domcontentloaded' });
            console.log(`[VPS Worker] ${config.name} loaded with reduced timeout`);
            // Continue with extraction but reduced scrolling
          } catch (retryError) {
            console.log(`[VPS Worker] ${config.name} failed retry, skipping`);
            continue;
          }
        } else if (error.message.includes('Protocol error')) {
          console.log(`[VPS Worker] Browser connection lost on ${config.name}, attempting recovery...`);
          try {
            await page.reload({ timeout: 10000 });
          } catch (reloadError) {
            console.log(`[VPS Worker] Recovery failed for ${config.name}, skipping`);
            continue;
          }
        } else {
          continue;
        }
      }
    }

    // Graceful browser cleanup
    try {
      await browser.close();
    } catch (closeError) {
      console.warn('[VPS Worker] Browser close warning:', closeError.message);
    }

    // Final breakthrough verification
    console.log(`[VPS Worker] FINAL RESULTS: ${allItems.length} total items extracted`);
    if (allItems.length > 250) {
      console.log(`[VPS Worker] BREAKTHROUGH SUCCESS: Found ${allItems.length - 250} items beyond 250 limit`);
    }

    const items = allItems;

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
            // Enhanced delay within batch to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, index * 75));

            const searchUrl = `https://api.themoviedb.org/3/search/multi?api_key=${process.env.TMDB_API_KEY}&query=${encodeURIComponent(item.title)}${item.year ? `&year=${item.year}` : ''}`;

            let searchResponse;
            let searchData;

            // Enhanced TMDB request with retry logic
            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                searchResponse = await fetch(searchUrl, {
                  timeout: 5000,
                  headers: {
                    'User-Agent': 'VPS-Worker/2.3.4'
                  }
                });

                if (searchResponse.status === 429) {
                  console.warn(`[VPS Worker] TMDB rate limit hit for ${item.title}, waiting...`);
                  await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                  continue;
                }

                if (!searchResponse.ok) {
                  throw new Error(`TMDB HTTP ${searchResponse.status}`);
                }

                searchData = await searchResponse.json();
                break;
              } catch (fetchError) {
                if (attempt === 3) {
                  throw fetchError;
                }
                console.warn(`[VPS Worker] TMDB attempt ${attempt} failed for ${item.title}:`, fetchError.message);
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
              }
            }

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

              // Enhanced detailed info with error handling (movies only)
              if (item.type === 'movie' && result.id) {
                try {
                  const detailUrl = `https://api.themoviedb.org/3/movie/${result.id}?api_key=${process.env.TMDB_API_KEY}`;
                  const detailResponse = await fetch(detailUrl, {
                    timeout: 3000,
                    headers: {
                      'User-Agent': 'VPS-Worker/2.3.4'
                    }
                  });

                  if (detailResponse.ok) {
                    const detailData = await detailResponse.json();
                    if (detailData.runtime) {
                      item.runtime = detailData.runtime;
                    }
                  }
                } catch (detailError) {
                  // Silent fail for detail requests to avoid breaking batch
                  console.debug(`[VPS Worker] Detail fetch failed for ${item.title}`);
                }
              }
            }
          } catch (tmdbError) {
            console.warn(`[VPS Worker] TMDB enhancement failed for "${item.title}":`, tmdbError.message);
            // Item remains in collection but without TMDB enhancements
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

    // Final validation and response
    if (items.length === 0) {
      console.warn(`[VPS Worker] No items extracted for user ${imdbUserId} - returning minimal fallback`);
      return res.json({
        success: false,
        error: 'No items extracted',
        message: 'Extraction returned 0 items. Check user ID or try again later.',
        totalItems: 0,
        lastUpdated: new Date().toISOString(),
        source: 'vps-worker'
      });
    }

    // Success response with comprehensive metadata
    return res.json({
      success: true,
      data: items,
      totalItems: items.length,
      breakthrough: items.length > 250,
      extractionPages: urlConfigs.length,
      lastUpdated: new Date().toISOString(),
      source: 'vps-worker',
      version: '2.3.4',
      enhanced: process.env.TMDB_API_KEY ? true : false,
      metadata: {
        moviesCount: items.filter(i => i.type === 'movie').length,
        tvCount: items.filter(i => i.type === 'tv').length,
        withPosters: items.filter(i => i.poster).length,
        extractionTime: Date.now() - startTime
      }
    });

  } catch (error) {
    console.error(`[VPS Worker] Critical error for user ${imdbUserId}:`, error);

    // Enhanced error classification
    let errorType = 'unknown';
    let statusCode = 500;
    let userMessage = error.message;

    if (error.message.includes('timeout')) {
      errorType = 'timeout';
      statusCode = 408;
      userMessage = 'Request timed out. IMDb may be slow or your watchlist is very large.';
    } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
      errorType = 'access_denied';
      statusCode = 403;
      userMessage = 'Access denied by IMDb. Try again later or check user ID.';
    } else if (error.message.includes('Browser')) {
      errorType = 'browser_error';
      statusCode = 503;
      userMessage = 'Browser automation failed. VPS may be under heavy load.';
    } else if (error.message.includes('TMDB')) {
      errorType = 'tmdb_error';
      statusCode = 502;
      userMessage = 'Movie database enhancement failed. Basic extraction may still work.';
    }

    return res.status(statusCode).json({
      success: false,
      error: errorType,
      message: userMessage,
      details: error.message,
      timestamp: new Date().toISOString(),
      version: '2.3.4',
      userId: imdbUserId
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