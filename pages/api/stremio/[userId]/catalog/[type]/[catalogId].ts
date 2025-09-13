import { NextApiRequest, NextApiResponse } from 'next';
import { chromium } from 'playwright';

interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  rating?: string;
  addedAt: string;
}

// Cache for watchlist data (in production, use Redis or similar)
const watchlistCache = new Map<string, { data: WatchlistItem[], timestamp: number }>();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

async function fetchWatchlist(userId: string): Promise<WatchlistItem[]> {
  // Check cache first
  const cached = watchlistCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Using cached data for ${userId}`);
    return cached.data;
  }

  console.log(`Fetching fresh data for ${userId}`);
  
  let browser = null;
  
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const watchlistUrl = `https://www.imdb.com/user/${userId}/watchlist`;
    await page.goto(watchlistUrl, { timeout: 15000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Check if watchlist is private or doesn't exist
    const isPrivate = await page.locator('text=This list is private').isVisible().catch(() => false);
    if (isPrivate) {
      throw new Error('Watchlist is private');
    }

    const pageTitle = await page.title();
    if (pageTitle.includes('404') || pageTitle.includes('Page not found')) {
      throw new Error('User not found');
    }

    const items = await page.$$eval('.lister-item, .titleColumn, [data-testid="title-list-item"]', (elements) => {
      return elements.map((item) => {
        try {
          const titleElement = item.querySelector('a[href*="/title/"]') || 
                             item.querySelector('.titleColumn a') ||
                             item.querySelector('h3 a');
          
          if (!titleElement) return null;

          const href = titleElement.getAttribute('href') || '';
          const imdbId = href.match(/\/title\/(tt\d+)\//)?.[1] || '';
          const title = titleElement.textContent?.trim() || '';
          
          const yearElement = item.querySelector('.secondaryInfo, .year, [class*="year"]');
          let year = yearElement?.textContent?.replace(/[()]/g, '').trim();
          year = year?.match(/\d{4}/)?.[0];

          const imageElement = item.querySelector('img[src*="amazon-images.com"], .loadlate, img[alt]');
          let poster = imageElement?.getAttribute('src') || imageElement?.getAttribute('loadlate') || '';
          
          // Optimize poster URL for better quality
          if (poster) {
            poster = poster.replace(/\._V1_.*/, '._V1_UX300_CR0,0,300,450_AL_.jpg');
          }

          // Determine content type
          const typeHints = (item.textContent || '').toLowerCase();
          const isTV = typeHints.includes('tv series') || 
                      typeHints.includes('mini series') || 
                      href.includes('episodes') ||
                      typeHints.includes('season');
          
          const type = isTV ? 'tv' : 'movie';

          if (!imdbId || !title) return null;

          return {
            imdbId,
            title: title.replace(/\s+/g, ' ').trim(),
            year,
            type,
            poster: poster || undefined,
            addedAt: new Date().toISOString()
          };
        } catch (error) {
          console.error('Error processing item:', error);
          return null;
        }
      }).filter(Boolean);
    });

    // Cache the result
    watchlistCache.set(userId, {
      data: items,
      timestamp: Date.now()
    });

    console.log(`Fetched ${items.length} items for ${userId}`);
    return items;

  } catch (error) {
    console.error(`Error fetching watchlist for ${userId}:`, error);
    // Return cached data if available, even if expired
    const cached = watchlistCache.get(userId);
    if (cached) {
      console.log(`Using expired cache for ${userId} due to error`);
      return cached.data;
    }
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  if (!userId.match(/^ur\d+$/)) {
    return res.status(400).json({ error: 'Invalid userId format' });
  }

  // Set CORS headers for Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    const watchlistItems = await fetchWatchlist(userId);
    
    // Filter by content type
    const filteredItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });

    // Convert to Stremio catalog format
    const metas = filteredItems.map(item => {
      const meta = {
        id: item.imdbId,
        type: item.type === 'tv' ? 'series' : 'movie',
        name: item.title,
        description: `Añadido a tu watchlist de IMDb`
      };
      
      // Add optional fields only if they exist
      if (item.year) meta.year = parseInt(item.year);
      if (item.poster) meta.poster = item.poster;
      
      return meta;
    });

    // Set cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=1800'); // Cache for 30 minutes

    return res.status(200).json({
      metas
    });

  } catch (error) {
    console.error('Error serving catalog:', error);
    
    return res.status(500).json({
      metas: []
    });
  }
}