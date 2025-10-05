import { getTMDBPosterBatch, getTMDBMetadataBatch, detectContentTypeBatch } from './tmdb';
import puppeteer from 'puppeteer';
import chromium from 'chrome-aws-lambda';

// Force rebuild - using Puppeteer with chrome-aws-lambda for serverless compatibility

export interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  rating?: string;
  imdbRating?: number;
  numRatings?: number;
  runtime?: number;
  popularity?: number;
  userRating?: number;
  addedAt: string;
}

// Simple in-memory cache per user with an in-flight guard
const watchlistCache = new Map<string, { data: WatchlistItem[]; timestamp: number }>();
const inFlight = new Map<string, Promise<WatchlistItem[]>>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function fetchWatchlist(userId: string, opts?: { forceRefresh?: boolean }): Promise<WatchlistItem[]> {
  const forceRefresh = opts?.forceRefresh === true;

  const cached = watchlistCache.get(userId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[fetchWatchlist] Using cached data for ${userId}, ${cached.data.length} items`);
    return cached.data;
  }

  // If a fetch is already running for this user, await it instead of spawning another browser
  const existing = inFlight.get(userId);
  if (existing) {
    console.log(`[fetchWatchlist] Awaiting in-flight fetch for ${userId}`);
    return existing;
  }

  let browser: any = null;
  const task = (async () => {
    console.log(`[fetchWatchlist] Starting MULTI-URL strategy for user ${userId} to overcome 250-item limit`);

    // Configure browser for serverless environments
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      // Use chrome-aws-lambda for serverless environments
      browser = await puppeteer.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath,
        headless: chromium.headless,
      });
    } else {
      // Use regular Puppeteer for local development
      browser = await puppeteer.launch({
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
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Set additional headers to avoid detection
    await page.setExtraHTTPHeaders({
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Optimized timeouts for faster performance
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // OPTIMIZED PAGINATION STRATEGY: Only process pages with content (performance boost)
    const urlConfigs = [
      {
        name: 'page-1-newest',
        url: `https://www.imdb.com/user/${userId}/watchlist?sort=created:desc&view=detail`,
      },
      {
        name: 'page-2-newest',
        url: `https://www.imdb.com/user/${userId}/watchlist?sort=created:desc&view=detail&page=2`,
      }
    ];

    let allItems: any[] = [];
    const seenIds = new Set<string>();

    // Function to extract items from current page with page offset for proper ordering
    async function extractItemsFromCurrentPage(sortName: string, pageOffset: number = 0): Promise<any[]> {
      console.log(`[fetchWatchlist] Extracting items for ${sortName} sort...`);

      // Enhanced scrolling for pagination
      try {
        console.log(`[fetchWatchlist] Scrolling ${sortName} page to load all items...`);

        // Capture browser console logs
        const consoleLogs: string[] = [];
        await page.evaluateOnNewDocument(() => {
          const originalLog = console.log;
          console.log = (...args) => {
            (window as any).capturedLogs = (window as any).capturedLogs || [];
            (window as any).capturedLogs.push(args.map(arg =>
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' '));
            originalLog.apply(console, args);
          };
        });

        // ENHANCED EXTRACTION: Comprehensive diagnostics and improved extraction logic
        const extractionResult = await page.evaluate(async () => {
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

          console.log('[EXTRACTION START] Beginning enhanced extraction with full diagnostics');

          // First, aggressive scrolling to load all items
          let previousCount = 0;
          let stableRounds = 0;

          for (let i = 0; i < 25; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(800); // Faster scrolling for performance

            const currentCount = document.querySelectorAll('a[href*="/title/"]').length;
            console.log(`[SCROLL ${i + 1}] Current title links: ${currentCount}`);

            // Check if we've stopped finding new items
            if (currentCount === previousCount) {
              stableRounds++;
              if (stableRounds >= 3) {
                console.log(`[SCROLL COMPLETE] No new items for 3 rounds, stopping at ${currentCount} items`);
                break;
              }
            } else {
              stableRounds = 0;
            }
            previousCount = currentCount;

            // PERFORMANCE: Early exit if we hit expected page limit
            if (currentCount >= 250 && i > 10) {
              console.log(`[SCROLL OPTIMIZATION] Found ${currentCount} items, checking for stability...`);
              await sleep(300); // Quick final check
            }
          }

          // Optimized DOM stabilization - faster processing
          console.log('[DOM STABILIZATION] Waiting for DOM to fully stabilize...');
          await sleep(2000); // Reduced from 5000ms for faster processing
          window.scrollTo(0, 0);
          await sleep(1500); // Reduced from 3000ms for faster processing

          // PHASE 1: MULTIPLE EXTRACTION METHOD ANALYSIS
          console.log('[PHASE 1] Analyzing different extraction methods...');

          // Method 1: .lister-item (detail view)
          const listerItems = Array.from(document.querySelectorAll('.lister-item'));
          console.log(`[METHOD 1] .lister-item: Found ${listerItems.length} items`);

          // Method 2: .ipc-poster-card (grid view)
          const ipcItems = Array.from(document.querySelectorAll('.ipc-poster-card'));
          console.log(`[METHOD 2] .ipc-poster-card: Found ${ipcItems.length} items`);

          // Method 3: All title links
          const allLinks = Array.from(document.querySelectorAll('a[href*="/title/"]'));
          console.log(`[METHOD 3] a[href*="/title/"]: Found ${allLinks.length} items`);

          // Method 4: Enhanced link detection with different patterns
          const titleLinks1 = Array.from(document.querySelectorAll('a[href^="/title/"]'));
          const titleLinks2 = Array.from(document.querySelectorAll('a[href*="imdb.com/title/"]'));
          console.log(`[METHOD 4A] a[href^="/title/"]: Found ${titleLinks1.length} items`);
          console.log(`[METHOD 4B] a[href*="imdb.com/title/"]: Found ${titleLinks2.length} items`);

          // PHASE 2: SAMPLE ANALYSIS FROM DIFFERENT POSITIONS
          console.log('[PHASE 2] Sampling items from different positions...');

          // Sample from beginning (1-10)
          console.log('[SAMPLE] First 10 items:');
          allLinks.slice(0, 10).forEach((a, i) => {
            const href = a.getAttribute('href') || '';
            const text = (a.textContent || '').trim();
            const match = href.match(/\/title\/(tt\d+)/);
            console.log(`  ${i+1}. ${match ? match[1] : 'NO-ID'}: "${text.substring(0, 50)}"`);
          });

          // Sample from middle (200-210)
          if (allLinks.length > 200) {
            console.log('[SAMPLE] Items 200-210:');
            allLinks.slice(199, 210).forEach((a, i) => {
              const href = a.getAttribute('href') || '';
              const text = (a.textContent || '').trim();
              const match = href.match(/\/title\/(tt\d+)/);
              console.log(`  ${i+200}. ${match ? match[1] : 'NO-ID'}: "${text.substring(0, 50)}"`);
            });
          }

          // Sample from end (last 10)
          if (allLinks.length > 10) {
            console.log('[SAMPLE] Last 10 items:');
            allLinks.slice(-10).forEach((a, i) => {
              const href = a.getAttribute('href') || '';
              const text = (a.textContent || '').trim();
              const match = href.match(/\/title\/(tt\d+)/);
              const actualIndex = allLinks.length - 10 + i;
              console.log(`  ${actualIndex+1}. ${match ? match[1] : 'NO-ID'}: "${text.substring(0, 50)}"`);
            });
          }

          // PHASE 3: PRE-FILTER EMPTY LINKS TO ELIMINATE DUPLICATES
          console.log('[PHASE 3] Pre-filtering empty links to eliminate duplicates...');

          // Filter out empty links before processing to solve duplication issue
          const filteredLinks = allLinks.filter((a, originalIndex) => {
            const href = a.getAttribute('href') || '';
            const text = (a.textContent || '').trim();

            // Keep link if it has meaningful text (not empty, not just IMDb ID, not generic text)
            const hasMeaningfulText = text &&
              text.length > 0 &&
              !text.match(/^(tt\d+|View title|›|\s*)$/) &&
              text.length > 2;

            // Log filtering decisions for first/last few items
            if (originalIndex < 10 || originalIndex > allLinks.length - 10) {
              console.log(`[FILTER ${originalIndex + 1}] "${text}" → ${hasMeaningfulText ? 'KEEP' : 'SKIP'}`);
            }

            return hasMeaningfulText;
          });

          console.log(`[PRE-FILTER] Reduced from ${allLinks.length} links to ${filteredLinks.length} links with meaningful text`);

          const extractedItems = [];
          const seenIds = new Set();
          let skippedCount = 0;
          let noIdCount = 0;
          let noTitleCount = 0;

          // Process filtered links (no more duplicates!)
          filteredLinks.forEach((a, index) => {
            try {
              const href = a.getAttribute('href') || '';

              // Enhanced regex patterns for IMDb ID extraction
              const patterns = [
                /\/title\/(tt\d+)/,           // Standard: /title/tt123456
                /imdb\.com\/title\/(tt\d+)/,  // Full URL: imdb.com/title/tt123456
                /(tt\d+)/                     // Fallback: just tt123456 anywhere
              ];

              let match = null;
              for (const pattern of patterns) {
                match = href.match(pattern);
                if (match) break;
              }

              if (!match) {
                noIdCount++;
                if (index < 20 || index > allLinks.length - 20) {
                  console.log(`[NO_ID ${index + 1}] href: "${href}"`);
                }
                return;
              }

              const id = match[1];

              // Simple deduplication (no smart replacement needed since empty links are pre-filtered)
              if (seenIds.has(id)) {
                skippedCount++;
                console.log(`[DUP ${index + 1}] Already processed ${id}`);
                return;
              }
              seenIds.add(id);

              // ENHANCED TITLE EXTRACTION with multiple fallbacks
              let title = '';

              // Method 1: Direct text content (cleaned)
              const directText = (a.textContent || '').trim();
              if (directText && !directText.match(/^(tt\d+|View title|›)$/) && directText.length > 0) {
                title = directText;
              }

              // Method 2: Look for title in parent containers
              if (!title) {
                const parent = a.closest('li, .lister-item, .ipc-poster-card, [class*="title"], .cli-item');
                if (parent) {
                  const titleSelectors = [
                    'h3 a', '.titleColumn a', '[data-testid="title"]',
                    '.ipc-title', 'h3', '.cli-title', '.ipc-title-link-wrapper'
                  ];

                  for (const selector of titleSelectors) {
                    const titleEl = parent.querySelector(selector);
                    if (titleEl && titleEl !== a && titleEl.textContent && titleEl.textContent.trim()) {
                      title = titleEl.textContent.trim();
                      break;
                    }
                  }
                }
              }

              // Method 3: Look for aria-label or title attributes
              if (!title) {
                title = a.getAttribute('aria-label') || a.getAttribute('title') || '';
              }

              // Method 4: Look in siblings for title
              if (!title) {
                const siblings = a.parentElement ? Array.from(a.parentElement.children) : [];
                for (const sibling of siblings) {
                  if (sibling !== a && sibling.textContent && sibling.textContent.trim().length > 2) {
                    const siblingText = sibling.textContent.trim();
                    if (!siblingText.match(/^(tt\d+|View title|\d{4}|›)$/)) {
                      title = siblingText;
                      break;
                    }
                  }
                }
              }

              // Clean up title
              title = title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

              // LENIENT FILTERING: Accept items even with minimal titles
              if (!title || title.length === 0) {
                title = `Movie ${id}`;
                noTitleCount++;
              }

              // Get year with enhanced detection
              let year = null;
              const parent = a.closest('li, .lister-item, .ipc-poster-card, .cli-item');
              if (parent) {
                const parentText = parent.textContent || '';
                const yearMatch = parentText.match(/\(?(19|20)\d{2}\)?/);
                year = yearMatch ? yearMatch[0].replace(/[()]/g, '') : null;
              }

              // Determine type with enhanced detection
              const contextText = parent ? (parent.textContent || '').toLowerCase() : '';
              const type = (contextText.includes('series') || contextText.includes('tv') ||
                           contextText.includes('show') || contextText.includes('episode')) ? 'tv' : 'movie';

              extractedItems.push({
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
              });

              // Enhanced debug logging for key positions
              if (index < 10 || (index >= 240 && index <= 260) || index > filteredLinks.length - 10) {
                console.log(`[EXTRACT ${index + 1}] ${id}: "${title}" (${year}) [${type}]`);
              }

            } catch (e) {
              console.log(`[ERROR] Failed to extract item ${index}:`, e);
            }
          });

          // FINAL DIAGNOSTICS
          console.log(`[DIAGNOSTICS] Original links found: ${allLinks.length}`);
          console.log(`[DIAGNOSTICS] After pre-filtering: ${filteredLinks.length}`);
          console.log(`[DIAGNOSTICS] Successfully extracted: ${extractedItems.length}`);
          console.log(`[DIAGNOSTICS] Skipped duplicates: ${skippedCount}`);
          console.log(`[DIAGNOSTICS] No IMDb ID found: ${noIdCount}`);
          console.log(`[DIAGNOSTICS] No title found (used fallback): ${noTitleCount}`);
          console.log(`[DIAGNOSTICS] Filtering effectiveness: ${((filteredLinks.length / allLinks.length) * 100).toFixed(1)}% retained`);

          console.log(`[EXTRACTION COMPLETE] Final count: ${extractedItems.length} items from ${filteredLinks.length} filtered links (${allLinks.length} total)`);

          // Return both extraction results and captured logs
          return {
            extractedItems,
            logs: (window as any).capturedLogs || []
          };
        });

        // Display captured browser console logs in server output
        if (extractionResult.logs && extractionResult.logs.length > 0) {
          console.log(`\n[BROWSER CONSOLE - ${sortName}] Captured ${extractionResult.logs.length} log entries:`);
          extractionResult.logs.forEach((log: string, index: number) => {
            console.log(`[BROWSER ${index + 1}] ${log}`);
          });
          console.log(`[BROWSER CONSOLE - ${sortName}] End of captured logs\n`);
        }

        const extractedItems = extractionResult.extractedItems || [];

        console.log(`[fetchWatchlist] ${sortName}: Found ${extractedItems.length} items after incremental extraction`);

        // Apply offset for proper newest-first ordering
        const itemsWithOffset = extractedItems.map((item, index) => ({
          ...item,
          addedAt: new Date(Date.now() - (pageOffset + index) * 1000).toISOString()
        }));

        return itemsWithOffset;

      } catch (e) {
        console.log(`[fetchWatchlist] ${sortName}: Incremental extraction failed:`, e);
        return [];
      }

      // OLD EXTRACTION LOGIC replaced by incremental method above
    }

    // MULTIPLE VIEW EXTRACTION: Try different views to get all items
    for (const config of urlConfigs) {
      try {
        console.log(`[fetchWatchlist] Processing ${config.name} (${config.url})`);
        await page.goto(config.url, { timeout: 30000, waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 1500));

        const pageItems = await extractItemsFromCurrentPage(config.name, allItems.length);
        console.log(`[fetchWatchlist] ${config.name}: Extracted ${pageItems.length} items`);

        // Add new items (deduplicate by IMDb ID)
        let newItemsCount = 0;
        for (const item of pageItems) {
          if (!seenIds.has(item.imdbId)) {
            seenIds.add(item.imdbId);
            allItems.push(item);
            newItemsCount++;
          }
        }

        console.log(`[fetchWatchlist] ${config.name}: Added ${newItemsCount} new items (total: ${allItems.length})`);

        // PERFORMANCE: Early exit if no new items found (saves time on empty pages)
        if (newItemsCount === 0 && allItems.length > 250) {
          console.log(`[fetchWatchlist] OPTIMIZATION: No new items from ${config.name}, skipping remaining pages`);
          break;
        }

        // PERFORMANCE: Early exit if we have good coverage (400+ items = ~80% of typical watchlists)
        if (allItems.length >= 400) {
          console.log(`[fetchWatchlist] OPTIMIZATION: Reached ${allItems.length} items (excellent coverage), stopping early`);
          break;
        }

      } catch (error) {
        console.error(`[fetchWatchlist] Error processing ${config.name}:`, error);
        // Continue with next view
      }
    }

    // Single page extraction complete
    console.log(`[fetchWatchlist] SINGLE PAGE COMPLETE: Found ${allItems.length} total unique items`);

    // Debug content type distribution
    const movieCount = allItems.filter(item => item.type === 'movie').length;
    const tvCount = allItems.filter(item => item.type === 'tv').length;
    console.log(`[fetchWatchlist] Content breakdown: ${movieCount} movies, ${tvCount} TV series`);

    // Sort items by addedAt to ensure newest-first order across all pages
    allItems.sort((a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime());

    console.log(`[fetchWatchlist] Sorted newest-first - first 3: ${allItems.slice(0, 3).map(x => x.title).join(', ')}`);

    // First, detect correct content types using TMDB
    if (allItems.length > 0) {
      console.log(`[fetchWatchlist] Detecting content types for ${allItems.length} items using TMDB...`);
      try {
        const contentTypes = await detectContentTypeBatch(
          allItems.map(item => ({ title: item.title, year: item.year }))
        );

        // Update content types based on TMDB detection
        allItems.forEach(item => {
          const key = `${item.title}_${item.year || 'unknown'}`;
          const detectedType = contentTypes.get(key);
          if (detectedType) {
            item.type = detectedType;
          }
        });

        const finalMovieCount = allItems.filter(item => item.type === 'movie').length;
        const finalTvCount = allItems.filter(item => item.type === 'tv').length;
        console.log(`[fetchWatchlist] Updated content breakdown: ${finalMovieCount} movies, ${finalTvCount} TV series`);

      } catch (error) {
        console.error('[fetchWatchlist] Error detecting content types:', error);
      }
    }

    // Enhance items with TMDB data (posters and ratings)
    if (allItems.length > 0) {
      console.log(`[fetchWatchlist] Fetching TMDB data for all ${allItems.length} items...`);
      try {
        // Fetch complete metadata including posters and ratings
        const tmdbMetadata = await getTMDBMetadataBatch(
          allItems.map(item => ({ title: item.title, year: item.year }))
        );

        // Apply TMDB data to all items
        allItems.forEach(item => {
          const key = `${item.title}_${item.year || 'unknown'}`;
          const metadata = tmdbMetadata.get(key);
          if (metadata) {
            if (metadata.poster) item.poster = metadata.poster;
            if (metadata.imdbRating) item.imdbRating = metadata.imdbRating;
            if (metadata.numRatings) item.numRatings = metadata.numRatings;
            if (metadata.runtime) item.runtime = metadata.runtime;
            if (metadata.popularity) item.popularity = metadata.popularity;
          }
        });

        const posterCount = allItems.filter(item => item.poster).length;
        const ratingCount = allItems.filter(item => item.imdbRating && item.imdbRating > 0).length;
        const movieCount = allItems.filter(item => item.type === 'movie').length;
        const tvCount = allItems.filter(item => item.type === 'tv').length;
        console.log(`[fetchWatchlist] Enhanced ${allItems.length} items: ${posterCount} posters, ${ratingCount} ratings (${movieCount} movies, ${tvCount} TV series)`);

      } catch (error) {
        console.error('[fetchWatchlist] Error fetching TMDB data:', error);
      }
    }

    // Only cache if result looks sane
    if (allItems.length >= 3) {
      watchlistCache.set(userId, { data: allItems, timestamp: Date.now() });
    }
    return allItems;
  })();

  inFlight.set(userId, task);

  try {
    return await task;
  } catch (error) {
    console.error(`[fetchWatchlist] Error fetching watchlist for ${userId}:`, error);
    if (cached) {
      console.log(`[fetchWatchlist] Returning cached data for ${userId} due to error`);
      return cached.data;
    }
    return [];
  } finally {
    inFlight.delete(userId);
    if (browser) {
      await browser.close();
    }
  }
}