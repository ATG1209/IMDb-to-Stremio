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

interface WatchlistResponse {
  items: WatchlistItem[];
  totalItems: number;
  lastUpdated: string;
  userId: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ 
      error: 'Missing userId parameter',
      message: 'Please provide a valid IMDb User ID (format: ur12345678)'
    });
  }

  // Validate user ID format
  if (!userId.match(/^ur\d+$/)) {
    return res.status(400).json({
      error: 'Invalid userId format',
      message: 'User ID must start with "ur" followed by numbers (example: ur12345678)'
    });
  }

  let browser = null;
  
  try {
    console.log(`Fetching watchlist for user: ${userId}`);
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Set realistic user agent
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // Navigate to public watchlist
    const watchlistUrl = `https://www.imdb.com/user/${userId}/watchlist`;
    console.log(`Navigating to: ${watchlistUrl}`);
    
    await page.goto(watchlistUrl, { timeout: 10000 });
    await page.waitForLoadState('networkidle');

    // Check if the page exists and watchlist is public
    const pageTitle = await page.title();
    if (pageTitle.includes('404') || pageTitle.includes('Page not found')) {
      throw new Error('Usuario no encontrado o watchlist privada');
    }

    // Check for privacy message
    const isPrivate = await page.locator('text=This list is private').isVisible().catch(() => false);
    if (isPrivate) {
      throw new Error('Esta watchlist es privada. Por favor, haz tu watchlist pública en tu configuración de IMDb.');
    }

    // Wait for watchlist content to load
    await page.waitForTimeout(2000);

    // Try different selectors for watchlist items
    const selectors = [
      '.lister-item',
      '.titleColumn',
      '[data-testid="title-list-item"]',
      '.cli-item',
      '.watchlist-ribbon'
    ];

    let items: any[] = [];
    
    for (const selector of selectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length === 0) continue;
        
        console.log(`Found ${elements.length} items using selector: ${selector}`);
        
        items = await page.$$eval(selector, (elements) => {
          return elements.map((item, index) => {
            try {
              // Try different ways to extract data
              const titleElement = item.querySelector('a[href*="/title/"]') || 
                                 item.querySelector('.titleColumn a') ||
                                 item.querySelector('h3 a') ||
                                 item.querySelector('[data-testid="title"] a');
              
              const yearElement = item.querySelector('.secondaryInfo') ||
                                item.querySelector('.year') ||
                                item.querySelector('[class*="year"]') ||
                                item.querySelector('.cli-title-metadata');

              const ratingElement = item.querySelector('.ipl-rating-star__rating') ||
                                  item.querySelector('[data-testid="ratingGroup--imdb-rating"]');

              const imageElement = item.querySelector('img[src*="amazon-images.com"]') ||
                                 item.querySelector('.loadlate') ||
                                 item.querySelector('img[alt]');

              if (!titleElement) return null;

              const href = titleElement.getAttribute('href') || '';
              const imdbId = href.match(/\/title\/(tt\d+)\//)?.[1] || '';
              const title = titleElement.textContent?.trim() || '';
              
              let year = yearElement?.textContent?.replace(/[()]/g, '').trim();
              year = year?.match(/\d{4}/)?.[0]; // Extract just the year

              const rating = ratingElement?.textContent?.trim();
              const poster = imageElement?.getAttribute('src') || '';

              // Try to determine if it's a movie or TV show
              const typeHints = item.textContent?.toLowerCase() || '';
              const isTV = typeHints.includes('tv') || 
                          typeHints.includes('series') || 
                          typeHints.includes('episode') ||
                          href.includes('/title/tt') && (typeHints.includes('season') || typeHints.includes('episodes'));
              
              const type = isTV ? 'tv' : 'movie';

              if (!imdbId || !title) return null;

              return {
                imdbId,
                title: title.replace(/\s+/g, ' ').trim(),
                year,
                type,
                rating,
                poster: poster ? poster.replace('@@._V1_UX.*_CR.*', '@@._V1_UX300_CR0,0,300,450_AL_') : undefined,
                addedAt: new Date().toISOString()
              };
            } catch (error) {
              console.error(`Error processing item ${index}:`, error);
              return null;
            }
          }).filter(Boolean);
        });
        
        if (items.length > 0) {
          console.log(`Successfully extracted ${items.length} items`);
          break;
        }
      } catch (e) {
        console.log(`Selector ${selector} failed:`, e.message);
        continue;
      }
    }

    if (items.length === 0) {
      // Try to check if there are any items at all
      const noItemsText = await page.locator('text=No titles in this list').isVisible().catch(() => false);
      if (noItemsText) {
        console.log('Watchlist is empty');
      } else {
        console.log('Could not find any watchlist items with known selectors');
        // Take a screenshot for debugging
        const pageContent = await page.content();
        console.log('Page title:', pageTitle);
        console.log('Page URL:', page.url());
      }
    }

    const response: WatchlistResponse = {
      items,
      totalItems: items.length,
      lastUpdated: new Date().toISOString(),
      userId
    };

    // Set cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=1800'); // Cache for 30 minutes
    
    return res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching watchlist:', error);
    
    let errorMessage = 'Error desconocido al acceder a la watchlist';
    
    if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      errorMessage = 'No se pudo conectar a IMDb. Verifica tu conexión a internet.';
    } else if (error.message.includes('404') || error.message.includes('not found')) {
      errorMessage = 'Usuario no encontrado. Verifica que el User ID sea correcto.';
    } else if (error.message.includes('privada') || error.message.includes('private')) {
      errorMessage = error.message;
    } else if (error.message.includes('timeout')) {
      errorMessage = 'Tiempo de espera agotado. IMDb puede estar lento, intenta de nuevo.';
    }

    return res.status(500).json({
      error: 'Failed to fetch watchlist',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}