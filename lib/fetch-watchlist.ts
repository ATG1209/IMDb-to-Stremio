import { getTMDBPosterBatch, getTMDBMetadataBatch } from './tmdb';
import { chromium } from 'playwright';

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

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });

    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // Set longer timeouts for pagination strategy
    page.setDefaultTimeout(60000);
    page.setDefaultNavigationTimeout(60000);

    // PAGINATION STRATEGY: Successfully extracts 410/501 items using page parameter
    const urlConfigs = [
      {
        name: 'page-1',
        url: `https://www.imdb.com/user/${userId}/watchlist?sort=created:asc&view=grid`,
        priority: 1
      },
      {
        name: 'page-2',
        url: `https://www.imdb.com/user/${userId}/watchlist?sort=created:asc&view=grid&page=2`,
        priority: 2
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

        const finalCount = await page.evaluate(async () => {
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

          for (let i = 0; i < 25; i++) { // Reduced scrolling for speed
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(800);

            const currentCount = Math.max(
              document.querySelectorAll('.lister-item').length,
              document.querySelectorAll('.ipc-poster-card').length,
              document.querySelectorAll('a[href*="/title/"]').length
            );

            if (i > 3 && currentCount > 0 && currentCount >= 200) {
              // Stop early if we have a good amount
              break;
            }
          }

          window.scrollTo(0, 0);
          const finalTitleCount = document.querySelectorAll('a[href*="/title/"]').length;
          return finalTitleCount;
        });

        console.log(`[fetchWatchlist] ${sortName}: Found ${finalCount} items after scrolling`);
        await page.waitForTimeout(2000);

      } catch (e) {
        console.log(`[fetchWatchlist] ${sortName}: Scroll loading failed:`, e);
      }

      // Extract watchlist items
      return await page.evaluate((pageOffset) => {
      const normalize = (arr: any[]) => arr.filter(item => item && item.imdbId && item.title).map((x, index) => {
        const addedAt = new Date(Date.now() - (pageOffset + index) * 1000).toISOString();
        return {
          imdbId: x.imdbId,
          title: (x.title || '').replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim(),
          year: x.year,
          type: x.type === 'tv' ? 'tv' : 'movie',
          poster: x.poster || undefined,
          imdbRating: x.imdbRating || 0,
          numRatings: x.numRatings || 0,
          runtime: x.runtime || 0,
          popularity: x.popularity || 0,
          userRating: x.userRating || 0,
          addedAt,
        };
      });

      // Extract from different DOM structures
      const lister = Array.from(document.querySelectorAll('.lister-item')).map((el) => {
        try {
          const a = el.querySelector('h3 a[href*="/title/"]');
          const href = a ? a.getAttribute('href') : '';
          const id = href ? (href.match(/tt\d+/) || [])[0] || '' : '';
          const title = a ? (a.textContent || '').trim() : '';
          const yearEl = el.querySelector('.lister-item-year, .secondaryInfo');
          const yearText = yearEl ? yearEl.textContent || '' : '';
          const year = (yearText.match(/(19|20)\d{2}/) || [])[0];
          const img = el.querySelector('img[src]');
          const text = (el.textContent || '').toLowerCase();
          const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';

          const ratingEl = el.querySelector('.ratings-bar .inline-block strong');
          const imdbRating = ratingEl ? parseFloat((ratingEl.textContent || '').trim() || '0') || 0 : 0;

          return id && title ? {
            imdbId: id,
            title,
            year,
            type,
            poster: img ? img.src : undefined,
            imdbRating,
            numRatings: 0,
            runtime: 0,
            popularity: 0,
            userRating: 0,
          } : null;
        } catch (e) {
          return null;
        }
      });

      const ipc = Array.from(document.querySelectorAll('.ipc-poster-card')).map((el) => {
        try {
          const a = el.querySelector('a[href*="/title/"]');
          const href = a ? a.getAttribute('href') : '';
          const id = href ? (href.match(/tt\d+/) || [])[0] || '' : '';
          const titleEl = el.querySelector('[data-testid="title"]');
          const title = (titleEl ? titleEl.textContent : (a ? a.textContent : '')).trim();
          const metaEl = el.querySelector('[data-testid="metadata"]');
          const meta = metaEl ? metaEl.textContent || '' : '';
          const year = (meta.match(/(19|20)\d{2}/) || [])[0];
          const img = el.querySelector('img[src]');
          const tagText = (el.textContent || '').toLowerCase();
          const type = tagText.includes('series') ? 'tv' : 'movie';

          return id && title ? {
            imdbId: id,
            title,
            year,
            type,
            poster: img ? img.src : undefined,
            imdbRating: 0,
            numRatings: 0,
            runtime: 0,
            popularity: 0,
            userRating: 0,
          } : null;
        } catch (e) {
          return null;
        }
      });

      // Fallback: extract from all title links
      const links = Array.from(document.querySelectorAll('a[href*="/title/"]'))
        .map((a) => {
          let id = '';
          if (a.href) {
            const match = a.href.match(/\/title\/(tt\d+)/) || a.href.match(/(tt\d+)/);
            id = match ? match[1] : '';
          }

          let title = (a.textContent || '').trim();
          title = title.replace(/^\d+\.\s*/, '').replace(/\s+/g, ' ').trim();

          if (!id || !title || title.length < 3) return null;

          const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"]');
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
          };
        }).filter(Boolean);

      // Remove duplicates
      const uniqueLinks = links.reduce((acc: any[], current) => {
        if (current && !acc.find(item => item.imdbId === current.imdbId)) {
          acc.push(current);
        }
        return acc;
      }, []);

      // Choose the method that gives us the most items
      const normalizedLister = normalize(lister);
      const normalizedIpc = normalize(ipc);
      const normalizedLinks = normalize(uniqueLinks);

      let chosen = normalizedLister;
      if (normalizedIpc.length > chosen.length) {
        chosen = normalizedIpc;
      }
      if (normalizedLinks.length > chosen.length) {
        chosen = normalizedLinks;
      }

      return chosen;
    }, pageOffset);
    }

    // MULTI-URL EXTRACTION: Try each sort configuration
    for (const config of urlConfigs) {
      try {
        console.log(`[fetchWatchlist] Processing ${config.name} (${config.url})`);

        await page.goto(config.url, { timeout: 45000 });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1500);

        const pageOffset = config.name === 'page-1' ? 0 : 250; // Page 1 = newest, Page 2 = older
        const pageItems = await extractItemsFromCurrentPage(config.name, pageOffset);
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

        // If we're getting close to 500 items, we can stop
        if (allItems.length > 450) {
          console.log(`[fetchWatchlist] Reached ${allItems.length} items, stopping multi-URL extraction`);
          break;
        }

      } catch (error) {
        console.error(`[fetchWatchlist] Error processing ${config.name}:`, error);
        // Continue with next URL configuration
      }
    }

    // Prioritize items based on sort order (newest first priority)
    console.log(`[fetchWatchlist] MULTI-URL COMPLETE: Found ${allItems.length} total unique items`);

    // Reverse array since created:asc gives oldest first, but we want newest first
    allItems.reverse();

    console.log(`[fetchWatchlist] Sorted array - first 3: ${allItems.slice(0, 3).map(x => x.title).join(', ')}`);

    // Enhance items with TMDB metadata
    if (allItems.length > 0) {
      const maxEnhance = 150; // Increased from 60 to cover more items with posters
      const itemsToEnhance = allItems.slice(0, maxEnhance);
      console.log(`[fetchWatchlist] Enhancing metadata from TMDB for ${itemsToEnhance.length}/${allItems.length} items...`);

      const movieItems = itemsToEnhance.filter(item => item.type === 'movie');
      if (movieItems.length > 0) {
        try {
          const tmdbMetadata = await getTMDBMetadataBatch(
            movieItems.map(item => ({ title: item.title, year: item.year }))
          );

          allItems.forEach(item => {
            if (item.type === 'movie') {
              const key = `${item.title}_${item.year || 'unknown'}`;
              const tmdbData = tmdbMetadata.get(key);
              if (tmdbData) {
                if (tmdbData.poster) {
                  item.poster = tmdbData.poster;
                }
                if (item.imdbRating === 0 && tmdbData.imdbRating > 0) {
                  item.imdbRating = tmdbData.imdbRating;
                }
                if (item.numRatings === 0 && tmdbData.numRatings > 0) {
                  item.numRatings = tmdbData.numRatings;
                }
                if (item.runtime === 0 && tmdbData.runtime > 0) {
                  item.runtime = tmdbData.runtime;
                }
                if (item.popularity === 0 && tmdbData.popularity > 0) {
                  item.popularity = tmdbData.popularity;
                }
                console.log(`[fetchWatchlist] Enhanced "${item.title}" with TMDB data`);
              }
            }
          });

          const enhancedCount = allItems.filter(item => item.imdbRating > 0 || item.runtime > 0 || item.poster).length;
          console.log(`[fetchWatchlist] ${enhancedCount}/${allItems.length} items now have enhanced metadata`);

        } catch (error) {
          console.error('[fetchWatchlist] Error fetching TMDB metadata:', error);
        }
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