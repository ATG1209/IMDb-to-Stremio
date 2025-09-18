import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient, WorkerWatchlistItem } from '../../../../../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../../../../../lib/fetch-watchlist'; // Fallback for development

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId, sortOption, nocache, refresh } = req.query;

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

    // Try VPS worker first, fallback to direct scraping in development
    const useWorker = process.env.WORKER_URL;

    if (useWorker) {
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
        } else {
          throw new Error('VPS worker is not healthy');
        }
      } catch (workerError) {
        console.warn(`[Catalog] VPS worker failed for ${userId}:`, workerError);

        // In production, return empty array rather than fallback
        if (isProduction) {
          watchlistItems = [];
        } else {
          // In development, fallback to direct scraping
          console.log('[Catalog] Falling back to direct scraping in development');
          watchlistItems = await fetchWatchlist(userId, { forceRefresh: force });
        }
      }
    } else {
      // No worker configured, use direct scraping (development mode)
      watchlistItems = await fetchWatchlist(userId, { forceRefresh: force });
    }
    
    // Filter by content type (items are already in newest-first order from fetch)
    const sortedItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });
    console.log(`[Catalog] Items already in newest-first order. Total items: ${sortedItems.length}, first 3: ${sortedItems.slice(0, 3).map(x => x.title).join(', ')}`);

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
