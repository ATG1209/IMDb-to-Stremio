const express = require('express');
const puppeteer = require('puppeteer');
const app = express();
const port = 3003;

// Enhanced stealth configuration
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const REFERRERS = [
  'https://www.google.com/',
  'https://www.bing.com/',
  'https://duckduckgo.com/',
  'https://www.imdb.com/'
];

// Enhanced random delay function
const randomDelay = (min = 500, max = 2000) => {
  return new Promise(resolve => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    setTimeout(resolve, delay);
  });
};

// Human-like mouse movements simulation
const simulateHumanBehavior = async (page) => {
  try {
    // Random mouse movements
    const mouseX = Math.floor(Math.random() * 1920);
    const mouseY = Math.floor(Math.random() * 1080);
    await page.mouse.move(mouseX, mouseY);

    // Random scroll
    const scrollAmount = Math.floor(Math.random() * 500) + 100;
    await page.evaluate((amount) => {
      window.scrollBy(0, amount);
    }, scrollAmount);

    await randomDelay(200, 800);
  } catch (error) {
    // Silent fail for behavior simulation
  }
};

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
    version: '2.3.7',
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

    // ENHANCED STEALTH BROWSER LAUNCH (v2.3.7)
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new', // Use new headless mode
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
          '--no-default-browser-check',
          // ENHANCED STEALTH FLAGS
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor,VizServiceDisplay',
          '--disable-ipc-flooding-protection',
          '--disable-client-side-phishing-detection',
          '--disable-component-update',
          '--disable-domain-reliability',
          '--disable-sync',
          '--disable-features=TranslateUI',
          '--disable-features=BlinkGenPropertyTrees',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-field-trial-config',
          '--disable-back-forward-cache',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--disable-popup-blocking',
          '--disable-component-extensions-with-background-pages',
          '--disable-extensions-file-access-check',
          '--enable-features=NetworkService,NetworkServiceInProcess',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--use-mock-keychain',
          '--disable-search-engine-choice-screen',
          '--disable-features=OptimizationHints',
          // Residential-like settings
          '--user-data-dir=/tmp/chrome-user-data',
          '--enable-automation=false',
          '--password-store=basic',
          '--use-mock-keychain'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: null
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

    // ADVANCED STEALTH CONFIGURATION (v2.3.7)
    await page.setViewport({
      width: 1920 + Math.floor(Math.random() * 100),
      height: 1080 + Math.floor(Math.random() * 100)
    });

    // Rotate user agents randomly
    const randomUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await page.setUserAgent(randomUA);
    console.log(`[VPS Worker] Using User-Agent: ${randomUA}`);

    // Enhanced headers with rotation
    const randomReferrer = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8,fr;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'DNT': '1',
      'Referer': randomReferrer,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Sec-CH-UA': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'Upgrade-Insecure-Requests': '1',
      'Connection': 'keep-alive'
    });

    // ADVANCED ANTI-DETECTION MEASURES
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver property
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Mock plugins array with realistic data
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          return [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' }
          ];
        },
      });

      // Enhanced language settings
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'es'],
      });

      // Mock platform data
      Object.defineProperty(navigator, 'platform', {
        get: () => 'Win32',
      });

      // Override permissions API
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );

      // Mock chrome runtime
      if (!window.chrome) {
        window.chrome = {};
      }
      if (!window.chrome.runtime) {
        window.chrome.runtime = {
          onConnect: undefined,
          onMessage: undefined
        };
      }

      // Override automation indicators
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_JSON;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Object;
      delete window.cdc_adoQpoasnfa76pfcZLmcfl_Proxy;

      // Mock device memory
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      // Mock hardware concurrency
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4,
      });

      // Mock connection
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: '4g',
          rtt: 100,
          downlink: 2.0
        }),
      });
    });

    // Request interception for header modification
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const headers = Object.assign({}, request.headers(), {
        'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"'
      });

      request.continue({ headers });
    });

    // Simulate realistic browsing behavior before actual scraping
    console.log(`[VPS Worker] Warming up session with realistic behavior...`);
    try {
      // Visit Google first to establish session
      await page.goto('https://www.google.com', { waitUntil: 'networkidle0', timeout: 10000 });
      await randomDelay(1000, 3000);
      await simulateHumanBehavior(page);

      // Then visit IMDb homepage
      await page.goto('https://www.imdb.com', { waitUntil: 'networkidle0', timeout: 15000 });
      await randomDelay(2000, 4000);
      await simulateHumanBehavior(page);

      console.log(`[VPS Worker] Session warmed up successfully`);
    } catch (warmupError) {
      console.warn(`[VPS Worker] Session warmup failed:`, warmupError.message);
      // Continue anyway
    }

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

        // ENHANCED NAVIGATION WITH HUMAN SIMULATION (v2.3.7)
        let navigationSuccess = false;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            console.log(`[VPS Worker] Attempt ${attempt}: Navigating to ${config.name}...`);

            // Human-like delay before navigation
            await randomDelay(1000, 3000);

            // Simulate realistic navigation
            await page.goto(config.url, {
              timeout: 45000,
              waitUntil: 'networkidle0'
            });

            // Simulate human reading time
            await randomDelay(2000, 5000);
            await simulateHumanBehavior(page);

            navigationSuccess = true;
            console.log(`[VPS Worker] Navigation successful for ${config.name}`);
            break;
          } catch (navError) {
            console.log(`[VPS Worker] Navigation attempt ${attempt} failed for ${config.name}:`, navError.message);
            if (attempt < 5) {
              // Exponential backoff with randomization
              const backoffTime = (2000 * attempt) + Math.floor(Math.random() * 2000);
              console.log(`[VPS Worker] Waiting ${backoffTime}ms before retry...`);
              await new Promise(resolve => setTimeout(resolve, backoffTime));

              // Try different user agent on retry
              if (attempt > 2) {
                const newUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
                await page.setUserAgent(newUA);
                console.log(`[VPS Worker] Switched to new User-Agent: ${newUA}`);
              }
            }
          }
        }

        if (!navigationSuccess) {
          console.log(`[VPS Worker] All navigation attempts failed for ${config.name}`);
          continue;
        }

        // Additional human behavior simulation
        await randomDelay(1500, 3500);
        await simulateHumanBehavior(page);

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

        // HUMAN-LIKE SCROLLING WITH ANTI-DETECTION (v2.3.7)
        console.log(`[VPS Worker] Starting human-like scrolling for ${config.name}...`);
        await page.evaluate(async () => {
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
          let previousCount = 0;
          let stableCount = 0;

          // HUMAN-LIKE SCROLLING PATTERN
          for (let i = 0; i < 30; i++) {
            // Simulate human scrolling patterns
            const scrollAmount = Math.floor(Math.random() * 500) + 300;
            const currentPosition = window.pageYOffset;
            const targetPosition = Math.min(currentPosition + scrollAmount, document.body.scrollHeight);

            // Smooth scroll simulation
            const scrollSteps = 5 + Math.floor(Math.random() * 5);
            const stepSize = (targetPosition - currentPosition) / scrollSteps;

            for (let step = 0; step < scrollSteps; step++) {
              window.scrollTo(0, currentPosition + (stepSize * step));
              await sleep(randomDelay(50, 150));
            }

            // Final position
            window.scrollTo(0, targetPosition);

            // Human-like reading pause
            await sleep(randomDelay(800, 2000));

            // Random small movements
            if (Math.random() > 0.7) {
              window.scrollBy(0, randomDelay(-50, 50));
              await sleep(randomDelay(200, 500));
            }

            const currentCount = document.querySelectorAll('a[href*="/title/"]').length;
            console.log(`[HUMAN-SCROLL ${i + 1}] Position: ${Math.floor(window.pageYOffset)}, Links: ${currentCount}`);

            if (currentCount === previousCount) {
              stableCount++;
              if (stableCount >= 4) {
                console.log(`[SCROLL COMPLETE] Stable at ${currentCount} items for 4 rounds`);
                break;
              }
            } else {
              stableCount = 0;
            }
            previousCount = currentCount;

            // Check if we've reached the bottom
            if (window.pageYOffset + window.innerHeight >= document.body.scrollHeight - 100) {
              console.log(`[SCROLL COMPLETE] Reached page bottom with ${currentCount} items`);
              await sleep(randomDelay(1000, 2000)); // Final wait
              break;
            }

            // Breakthrough detection with human-like behavior
            if (currentCount >= 250 && i > 15) {
              console.log(`[BREAKTHROUGH CHECK] Found ${currentCount} items, verifying stability...`);
              await sleep(randomDelay(500, 1500));
            }
          }

          // Human-like final review scroll
          console.log('[FINAL REVIEW] Human-like page review...');
          await sleep(randomDelay(1000, 2000));

          // Scroll to top gradually
          const currentPos = window.pageYOffset;
          const scrollToTopSteps = 8;
          for (let step = 0; step < scrollToTopSteps; step++) {
            const targetPos = currentPos * (1 - (step + 1) / scrollToTopSteps);
            window.scrollTo(0, targetPos);
            await sleep(randomDelay(200, 400));
          }

          window.scrollTo(0, 0);
          await sleep(randomDelay(1500, 2500));
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
                    'User-Agent': 'VPS-Worker/2.3.7'
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
                      'User-Agent': 'VPS-Worker/2.3.7'
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
      version: '2.3.7',
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
      version: '2.3.7',
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