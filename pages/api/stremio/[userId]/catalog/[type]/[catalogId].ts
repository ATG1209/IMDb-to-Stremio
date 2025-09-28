import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient, WorkerWatchlistItem } from '../../../../../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../../../../../lib/fetch-watchlist'; // Fallback for development

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId, nocache, refresh } = req.query;

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
    // Production logging
    const startTime = Date.now();
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      console.log(`[Catalog API] Request: ${type}/${catalogId} for user ${userId}`);
    }

    const force = (Array.isArray(nocache) ? nocache[0] : nocache) === '1' ||
                  (Array.isArray(refresh) ? refresh[0] : refresh) === '1';

    let watchlistItems: WorkerWatchlistItem[] = [];

    // TEMPORARY: Disable VPS worker to force fallback extraction
    const useWorker = false; // process.env.WORKER_URL;

    // TEMPORARY: Test mode for debugging IMDb blocking issues
    const testMode = req.query.test === '1';

    if (testMode) {
      console.log('[Catalog] Using test data mode to verify addon functionality');
      watchlistItems = [
        {
          imdbId: 'tt0111161',
          title: 'The Shawshank Redemption',
          year: '1994',
          type: 'movie',
          poster: 'https://image.tmdb.org/t/p/w500/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg',
          imdbRating: 9.3,
          numRatings: 2500000,
          runtime: 142,
          popularity: 85.4,
          userRating: 0,
          addedAt: new Date().toISOString()
        },
        {
          imdbId: 'tt0068646',
          title: 'The Godfather',
          year: '1972',
          type: 'movie',
          poster: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
          imdbRating: 9.2,
          numRatings: 1700000,
          runtime: 175,
          popularity: 92.1,
          userRating: 0,
          addedAt: new Date().toISOString()
        },
        {
          imdbId: 'tt0468569',
          title: 'The Dark Knight',
          year: '2008',
          type: 'movie',
          poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
          imdbRating: 9.0,
          numRatings: 2300000,
          runtime: 152,
          popularity: 88.7,
          userRating: 0,
          addedAt: new Date().toISOString()
        }
      ];
    } else if (useWorker) {
      try {
        // Check worker health first
        const isWorkerHealthy = await vpsWorkerClient.isHealthy();

        if (isWorkerHealthy) {
          watchlistItems = await vpsWorkerClient.scrapeWatchlist(userId, {
            forceRefresh: force
          });

          if (isProduction) {
            console.log(`[Catalog] Using VPS worker: ${watchlistItems.length} items`);
          }

          // Treat 0 items as VPS worker failure to trigger fallback
          if (watchlistItems.length === 0) {
            throw new Error('VPS worker returned 0 items - likely blocked or access denied');
          }
        } else {
          throw new Error('VPS worker is not healthy');
        }
      } catch (workerError) {
        console.warn(`[Catalog] VPS worker failed for ${userId}:`, workerError);

        // Enable fallback in production when VPS worker fails
        console.log('[Catalog] VPS worker failed, falling back to direct breakthrough extraction');
        try {
          watchlistItems = await fetchWatchlist(userId, { forceRefresh: force });
          console.log(`[Catalog] Fallback extraction successful: ${watchlistItems.length} items`);
        } catch (fallbackError) {
          console.error('[Catalog] Fallback extraction also failed:', fallbackError);
          watchlistItems = [];
        }
      }
    } else {
      // No worker configured, use direct scraping (development mode)
      watchlistItems = await fetchWatchlist(userId, { forceRefresh: force });
    }
    
    // Filter by content type and reverse to get newest-first order (proven solution from v1.8.1)
    const filteredItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });

    // User requested oldest-first order (opposite of previous newest-first)
    const sortedItems = [...filteredItems]; // No reverse = oldest-first order
    console.log(`[Catalog] Using oldest-first order. Total items: ${sortedItems.length}, first 3: ${sortedItems.slice(0, 3).map(x => x.title).join(', ')}`);

    // Convert to Stremio catalog format
    const metas = sortedItems.map(item => {
      const meta: any = {
        id: item.imdbId,
        type: item.type === 'tv' ? 'series' : 'movie',
        name: item.title,
        description: `Añadido a tu watchlist de IMDb`
      };

      if (item.year) meta.year = parseInt(item.year);
      if (item.poster) meta.poster = item.poster;

      return meta;
    });

    // Set cache headers (allow Stremio to cache briefly)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

    // Production performance logging
    if (isProduction) {
      const duration = Date.now() - startTime;
      console.log(`[Catalog API] Served ${metas.length} ${type}s in ${duration}ms`);
    }

    return res.status(200).json({ metas, cacheMaxAge: 60 });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Enhanced error logging for production
    if (process.env.NODE_ENV === 'production') {
      console.error(`[Catalog API] Error for ${userId}/${type}/${catalogId}:`, errorMessage);
    } else {
      console.error('Error serving catalog:', error);
    }

    // Return 200 with empty metas to avoid Stremio "Failed to fetch"
    return res.status(200).json({
      metas: [],
      cacheMaxAge: 30,
      error: process.env.NODE_ENV === 'production' ? 'Service temporarily unavailable' : errorMessage
    });
  }
}
