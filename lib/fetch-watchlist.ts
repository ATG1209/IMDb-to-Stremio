import { chromium } from 'playwright';
import { getTMDBPosterBatch } from './tmdb';

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

// Simple in-memory cache per user
const watchlistCache = new Map<string, { data: WatchlistItem[]; timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

export async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  // Clear cache for debugging
  watchlistCache.delete(userId);
  
  const cached = watchlistCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`[fetchWatchlist] Using cached data for ${userId}, ${cached.data.length} items`);
    return cached.data;
  }

  let browser: any = null;
  try {
    console.log(`[fetchWatchlist] Starting browser for user ${userId}`);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const watchlistUrl = `https://www.imdb.com/user/${userId}/watchlist`;
    console.log(`[fetchWatchlist] Navigating to ${watchlistUrl}`);
    await page.goto(watchlistUrl, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

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
      await page.waitForSelector('.lister-item, .ipc-poster, [data-testid="title-list-item"]', { timeout: 10000 });
    } catch (e) {
      console.log('[fetchWatchlist] No standard watchlist items found, trying alternative selectors...');
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

    // Wait for content to load dynamically  
    await page.waitForTimeout(5000);
    
    // Create a function that runs in the browser context to extract watchlist items
    const items = await page.evaluate(() => {
      const results = [];
      const processedItems = new Set();
      
      // Look for all title links
      const titleLinks = Array.from(document.querySelectorAll('a[href*="/title/"]'));
      console.log(`Processing ${titleLinks.length} title links`);
      
      titleLinks.forEach((link, index) => {
        try {
          const href = link.getAttribute('href') || '';
          const match = href.match(/\/title\/(tt\d+)\//);
          if (!match) return;
          
          const imdbId = match[1];
          if (processedItems.has(imdbId)) return;
          
          const titleText = link.textContent?.trim();
          if (!titleText || titleText.length < 2) return;
          
          // Skip navigation and UI links
          if (titleText.includes('IMDb') || titleText.includes('Menu') || titleText.includes('Home')) {
            return;
          }
          
          // Clean title
          let title = titleText.replace(/^\d+\.\s*/, '');
          
          // Find parent container with more info
          let container = link.parentElement;
          let depth = 0;
          while (container && depth < 10) {
            const text = container.textContent || '';
            if (text.includes(title) && (text.includes('20') || text.includes('19'))) {
              break;
            }
            container = container.parentElement;
            depth++;
          }
          
          // Extract year
          let year = '';
          if (container) {
            const yearMatch = container.textContent?.match(/\b(19|20)\d{2}\b/);
            year = yearMatch?.[0] || '';
          }
          
          // Find image
          let poster = '';
          if (container) {
            const img = container.querySelector('img[src*="amazon"]');
            if (img) {
              poster = img.src.replace(/\._V1_.*/, '._V1_UX300_CR0,0,300,450_AL_.jpg');
            }
          }
          
          // Determine type
          const contextText = container?.textContent?.toLowerCase() || '';
          const isTV = contextText.includes('tv series') || 
                      contextText.includes('mini series') ||
                      contextText.includes('series') ||
                      href.includes('episodes');
          
          processedItems.add(imdbId);
          
          if (index < 10) {
            console.log(`Item ${index}: ${title} (${imdbId}) - ${year}`);
          }
          
          results.push({
            imdbId,
            title: title.replace(/\s+/g, ' ').trim(),
            year,
            type: isTV ? 'tv' : 'movie',
            poster: poster || undefined,
            addedAt: new Date().toISOString(),
          });
          
        } catch (error) {
          console.log(`Error processing link ${index}: ${error.message}`);
        }
      });
      
      console.log(`Extracted ${results.length} unique items`);
      return results;
    });

    console.log(`[fetchWatchlist] Found ${items.length} items for ${userId}`);
    
    // Fetch posters from TMDB for all movies (not TV shows as they have different endpoint)
    if (items.length > 0) {
      console.log(`[fetchWatchlist] Fetching posters from TMDB for ${items.length} items...`);
      
      const movieItems = items.filter(item => item.type === 'movie');
      if (movieItems.length > 0) {
        try {
          const tmdbPosters = await getTMDBPosterBatch(
            movieItems.map(item => ({ title: item.title, year: item.year }))
          );
          
          // Update items with TMDB posters
          items.forEach(item => {
            if (item.type === 'movie') {
              const key = `${item.title}_${item.year || 'unknown'}`;
              const tmdbPoster = tmdbPosters.get(key);
              if (tmdbPoster && !item.poster) {
                item.poster = tmdbPoster;
                console.log(`[fetchWatchlist] Added TMDB poster for "${item.title}"`);
              }
            }
          });
          
          const postersFound = items.filter(item => item.poster).length;
          console.log(`[fetchWatchlist] Total items with posters: ${postersFound}/${items.length}`);
          
        } catch (error) {
          console.error('[fetchWatchlist] Error fetching TMDB posters:', error);
        }
      }
    }
    
    watchlistCache.set(userId, { data: items, timestamp: Date.now() });
    return items;
  } catch (error) {
    console.error(`[fetchWatchlist] Error fetching watchlist for ${userId}:`, error);
    if (cached) {
      console.log(`[fetchWatchlist] Returning cached data for ${userId} due to error`);
      return cached.data;
    }
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

