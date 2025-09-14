import { chromium } from 'playwright';
import { getTMDBPosterBatch, getTMDBMetadataBatch } from './tmdb';

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
    console.log(`[fetchWatchlist] Starting browser for user ${userId}`);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Force a stable layout (detail view) so selectors work reliably
    const urlDetail = `https://www.imdb.com/user/${userId}/watchlist?sort=created:desc&view=detail`;
    const urlGrid = `https://www.imdb.com/user/${userId}/watchlist?sort=created:desc&view=grid`;
    console.log(`[fetchWatchlist] Navigating to ${urlDetail}`);
    await page.goto(urlDetail, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const pageTitle = await page.title();
    console.log(`[fetchWatchlist] Page title: ${pageTitle}`);

    // Detect private or invalid watchlists
    const isPrivate = await page.locator('text=This list is private').isVisible().catch(() => false);
    if (isPrivate) {
      console.log(`[fetchWatchlist] Watchlist is private for ${userId}`);
      throw new Error('Watchlist is private');
    }

    if (pageTitle.includes('404') || pageTitle.includes('Page not found')) {
      console.log(`[fetchWatchlist] User not found: ${userId}`);
      throw new Error('User not found');
    }

    // Check if watchlist is empty
    const emptyListText = await page.locator('text=No titles have been added to your Watchlist, text=There are no titles in this list, text=Your Watchlist is empty').isVisible().catch(() => false);
    if (emptyListText) {
      console.log(`[fetchWatchlist] Watchlist is empty for ${userId}`);
      watchlistCache.set(userId, { data: [], timestamp: Date.now() });
      return [];
    }

    console.log(`[fetchWatchlist] Looking for watchlist items...`);
    
    // Wait for the watchlist to load
    try {
      await page.waitForSelector('.lister-item, .ipc-poster-card, [data-testid="title-list-item"]', { timeout: 10000 });
    } catch (e) {
      console.log('[fetchWatchlist] No standard selectors in detail view, trying grid view...');
      await page.goto(urlGrid, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      await page.waitForSelector('.ipc-poster-card, a[href*="/title/"]', { timeout: 10000 }).catch(() => {});
    }

    // Debug: Get page structure
    console.log(`[fetchWatchlist] Analyzing page structure...`);
    const debugInfo = await page.evaluate(() => {
      const body = document.body;
      const allDivs = Array.from(body.querySelectorAll('div')).slice(0, 10);
      const hasListItems = body.querySelector('.lister-item') ? 'YES' : 'NO';
      const hasTestIdItems = body.querySelector('[data-testid="title-list-item"]') ? 'YES' : 'NO';
      const hasCliItems = body.querySelector('.cli-item') ? 'YES' : 'NO';
      const hasPosterCards = body.querySelector('.ipc-poster-card') ? 'YES' : 'NO';
      const titleLinks = Array.from(body.querySelectorAll('a[href*="/title/"]')).length;
      
      return {
        hasListItems,
        hasTestIdItems,
        hasCliItems,
        hasPosterCards,
        titleLinks,
        firstDivClasses: allDivs.map(d => d.className).slice(0, 5)
      };
    });
    
    console.log('[fetchWatchlist] Page analysis:', JSON.stringify(debugInfo, null, 2));

    // Load more by scrolling – new IMDb UI lazy-loads items
    try {
      await page.evaluate(async () => {
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
        let lastCount = 0;
        let stableRounds = 0;
        for (let i = 0; i < 15; i++) { // ~15s max
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(800);
          const current = document.querySelectorAll('a[href*="/title/"]').length;
          if (current <= lastCount) {
            stableRounds++;
          } else {
            stableRounds = 0;
            lastCount = current;
          }
          if (stableRounds >= 3) break; // no more items loading
        }
        window.scrollTo(0, 0);
      });
    } catch (e) {
      console.log('[fetchWatchlist] Scroll loading failed or not needed');
    }
    
    // Create a function that runs in the browser context to extract watchlist items
    let items = await page.evaluate(() => {
      const normalize = (arr: any[]) => arr.filter(Boolean).map((x, index) => ({
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
        // Use index to maintain scraped order (newest first from IMDb sort=created:desc)
        // Subtract index from current time to preserve order - first item gets newest timestamp
        addedAt: new Date(Date.now() - index * 1000).toISOString(),
      }));

      const lister = Array.from(document.querySelectorAll('.lister-item')).map((el) => {
        const a = el.querySelector<HTMLAnchorElement>('h3 a[href*="/title/"]');
        const href = a?.getAttribute('href') || '';
        const id = href.match(/tt\d+/)?.[0] || '';
        const title = a?.textContent?.trim() || '';
        const year = (el.querySelector('.lister-item-year, .secondaryInfo')?.textContent || '').match(/(19|20)\d{2}/)?.[0];
        const img = el.querySelector<HTMLImageElement>('img[src]');
        const text = el.textContent?.toLowerCase() || '';
        const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';
        
        // Extract rating information
        const ratingEl = el.querySelector('.ratings-bar .inline-block strong');
        const imdbRating = ratingEl ? parseFloat(ratingEl.textContent?.trim() || '0') || 0 : 0;
        
        // Extract number of ratings (votes)
        const ratingsCountEl = el.querySelector('.sort-num_votes-visible span[name="nv"]');
        const numRatings = ratingsCountEl ? parseInt(ratingsCountEl.textContent?.replace(/[,\s]/g, '') || '0') || 0 : 0;
        
        // Extract runtime
        const runtimeEl = el.querySelector('.runtime, .text-muted .runtime');
        const runtimeText = runtimeEl?.textContent?.trim() || '';
        const runtime = runtimeText.match(/(\d+)\s*min/)?.[1] ? parseInt(runtimeText.match(/(\d+)\s*min/)[1]) : 0;
        
        // Extract user rating (if available)
        const userRatingEl = el.querySelector('.user-rating .inline-block strong, .rate .inline-block strong');
        const userRating = userRatingEl ? parseFloat(userRatingEl.textContent?.trim() || '0') || 0 : 0;
        
        // Calculate popularity based on number of ratings (simple heuristic)
        const popularity = numRatings > 0 ? Math.log10(numRatings) * 1000 : 0;
        
        return id && title ? { 
          imdbId: id, 
          title, 
          year, 
          type, 
          poster: img?.src,
          imdbRating,
          numRatings,
          runtime,
          popularity,
          userRating
        } : null;
      });

      const ipc = Array.from(document.querySelectorAll('.ipc-poster-card')).map((el) => {
        const a = el.querySelector<HTMLAnchorElement>('a[href*="/title/"]');
        const href = a?.getAttribute('href') || '';
        const id = href.match(/tt\d+/)?.[0] || '';
        const title = (el.querySelector('[data-testid="title"]')?.textContent || a?.textContent || '').trim();
        const meta = el.querySelector('[data-testid="metadata"]')?.textContent || '';
        const year = meta.match(/(19|20)\d{2}/)?.[0];
        const img = el.querySelector<HTMLImageElement>('img[src]');
        const tagText = (el.textContent || '').toLowerCase();
        const type = tagText.includes('series') ? 'tv' : 'movie';
        
        // Extract rating from metadata or rating elements
        const ratingEl = el.querySelector('[data-testid="ratingGroup--imdb-rating"]');
        const imdbRating = ratingEl ? parseFloat(ratingEl.textContent?.trim() || '0') || 0 : 0;
        
        // Extract votes/ratings count
        const voteEl = el.querySelector('[data-testid="ratingGroup--imdb-rating"] + span');
        const numRatings = voteEl ? parseInt(voteEl.textContent?.replace(/[(),\s]/g, '') || '0') || 0 : 0;
        
        // Runtime might be in metadata
        const runtime = meta.match(/(\d+)\s*min/)?.[1] ? parseInt(meta.match(/(\d+)\s*min/)[1]) : 0;
        
        // Calculate popularity
        const popularity = numRatings > 0 ? Math.log10(numRatings) * 1000 : 0;
        
        return id && title ? { 
          imdbId: id, 
          title, 
          year, 
          type, 
          poster: img?.src,
          imdbRating,
          numRatings,
          runtime,
          popularity,
          userRating: 0  // Usually not visible in poster cards
        } : null;
      });

      let chosen = lister.length >= ipc.length ? normalize(lister) : normalize(ipc);

      if (chosen.length < 3) {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/title/"]'))
          .map((a) => {
            const id = a.href.match(/tt\d+/)?.[0] || '';
            const t = a.textContent?.trim() || '';
            return id && t ? { imdbId: id, title: t } : null;
          }).filter(Boolean);
        chosen = normalize(links as any[]);
      }
      return chosen;
    });

    // If we got suspiciously few items, retry once using the other view
    if (items.length < 5) {
      try {
        const currentUrl = location.href;
        // Switch view client-side by replacing query param
      } catch {}
      console.log(`[fetchWatchlist] Low item count (${items.length}). Retrying with alternate view...`);
      await page.goto(items.length === 0 ? urlGrid : urlDetail, { timeout: 15000 });
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(800);
      // Scroll again
      try {
        await page.evaluate(async () => {
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
          for (let i = 0; i < 8; i++) {
            window.scrollTo(0, document.body.scrollHeight);
            await sleep(600);
          }
          window.scrollTo(0, 0);
        });
      } catch {}
      items = await page.evaluate(() => {
        const results: any[] = [];
        const processed = new Set<string>();
        const push = (id: string, title: string, year?: string, poster?: string, typeHint?: string, 
                      imdbRating = 0, numRatings = 0, runtime = 0, popularity = 0, userRating = 0) => {
          if (!id || !title) return;
          if (processed.has(id)) return;
          processed.add(id);
          // Use results length as index to maintain order consistency
          const index = results.length;
          results.push({ 
            imdbId: id, 
            title, 
            year, 
            type: typeHint === 'tv' ? 'tv' : 'movie', 
            poster, 
            imdbRating,
            numRatings,
            runtime,
            popularity,
            userRating,
            addedAt: new Date(Date.now() - index * 1000).toISOString() 
          });
        };
        document.querySelectorAll('.lister-item').forEach((el) => {
          const a = el.querySelector('h3 a[href*="/title/"]') as HTMLAnchorElement | null;
          const id = a?.href?.match(/tt\d+/)?.[0] || '';
          const title = (a?.textContent?.trim() || '').replace(/^\d+\.\s*/, '');
          const year = (el.querySelector('.lister-item-year, .secondaryInfo')?.textContent || '').trim();
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          push(id, title, year, img?.src || undefined);
        });
        document.querySelectorAll('.ipc-poster-card').forEach((el) => {
          const a = el.querySelector('a[href*="/title/"]') as HTMLAnchorElement | null;
          const id = a?.href?.match(/tt\d+/)?.[0] || '';
          const title = (el.querySelector('[data-testid="title"]')?.textContent || a?.textContent || '').trim().replace(/^\d+\.\s*/, '');
          const img = el.querySelector('img[src]') as HTMLImageElement | null;
          const meta = el.querySelector('[data-testid="metadata"]')?.textContent || '';
          const year = meta.match(/(19|20)\d{2}/)?.[0];
          push(id, title, year, img?.src || undefined);
        });
        return results;
      });
    }

    console.log(`[fetchWatchlist] Found ${items.length} items for ${userId}`);
    
    // Enhance items with TMDB metadata (limit to first 50 items for performance)
    if (items.length > 0) {
      const maxEnhance = 50; // Reduced from 100 due to more expensive calls
      const itemsToEnhance = items.slice(0, maxEnhance);
      console.log(`[fetchWatchlist] Enhancing metadata from TMDB for ${itemsToEnhance.length}/${items.length} items...`);
      
      // Focus on movies first, as they have better TMDB coverage
      const movieItems = itemsToEnhance.filter(item => item.type === 'movie');
      if (movieItems.length > 0) {
        try {
          const tmdbMetadata = await getTMDBMetadataBatch(
            movieItems.map(item => ({ title: item.title, year: item.year }))
          );
          
          // Update items with TMDB metadata
          items.forEach(item => {
            if (item.type === 'movie') {
              const key = `${item.title}_${item.year || 'unknown'}`;
              const tmdbData = tmdbMetadata.get(key);
              if (tmdbData) {
                // Only update if current values are missing/zero
                if (!item.poster && tmdbData.poster) {
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
          
          const enhancedCount = items.filter(item => item.imdbRating > 0 || item.runtime > 0 || item.poster).length;
          console.log(`[fetchWatchlist] ${enhancedCount}/${items.length} items now have enhanced metadata`);
          
        } catch (error) {
          console.error('[fetchWatchlist] Error fetching TMDB metadata:', error);
        }
      }
    }
    
    // Only cache if result looks sane (avoid caching partial loads)
    if (items.length >= 3) {
      watchlistCache.set(userId, { data: items, timestamp: Date.now() });
    }
    return items;
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
