import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient, WorkerPendingError, WorkerWatchlistResult } from '../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../lib/fetch-watchlist';
import { ensureContentTypesWithTMDB } from '../../lib/tmdb';

interface WatchlistItem {
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

interface CacheMetadata {
  lastScraped: string;
  cacheAge: number;
  isStale: boolean;
  nextRefresh?: string;
}

interface WatchlistResponse {
  items: WatchlistItem[];
  totalItems: number;
  lastUpdated: string;
  userId: string;
  source: string;
  cacheMetadata?: CacheMetadata;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, forceRefresh, refresh, nocache } = req.query;

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

  // Support multiple refresh parameter formats
  const shouldForceRefresh = forceRefresh === 'true' || refresh === '1' || nocache === '1';

  try {
    console.log(`[Web App] Fetching watchlist for user: ${userId} (forceRefresh: ${shouldForceRefresh})`);

    let items = [];
    let refreshSource = 'unknown';

    // Try VPS worker first, fallback to direct scraping
    const useWorker = process.env.WORKER_URL;

    if (useWorker) {
      try {
        // Check worker health first
        const isWorkerHealthy = await vpsWorkerClient.isHealthy();

        if (isWorkerHealthy) {
          console.log('[Web App] Using VPS worker for web app preview');
          const workerItems = await vpsWorkerClient.scrapeWatchlist(userId, { forceRefresh: shouldForceRefresh });
          refreshSource = (workerItems as WorkerWatchlistResult).source || 'worker-job';
          const workerMetadata = (workerItems as WorkerWatchlistResult).metadata;
          items = workerItems;

          // VPS returns oldest-first from IMDb, reverse to show newest first
          if (items && items.length > 0) {
            items = [...items].reverse();
          }

          // Preserve source flag after copying array
          (items as WorkerWatchlistResult).source = refreshSource;
          if (workerMetadata) {
            (items as WorkerWatchlistResult).metadata = workerMetadata;
          }

          // OPTIMIZATION: Skip TMDB detection for VPS worker data
          // VPS worker already runs TMDB content type detection and caching
          // Only run TMDB detection when using fallback direct scraping
          console.log('[Web App] ✓ Using VPS worker data (already has TMDB content types)');
        } else {
          throw new Error('VPS worker is not healthy');
        }
      } catch (workerError) {
        console.warn(`[Web App] VPS worker failed for ${userId}:`, workerError);

        // Fallback to direct scraping
        console.log('[Web App] Falling back to direct scraping');
        items = await fetchWatchlist(userId);
        refreshSource = workerError instanceof WorkerPendingError ? 'fallback-after-worker-pending' : 'fallback-direct';

        // Run TMDB detection for fallback data (since it didn't go through VPS worker)
        const tmdbKey = process.env.TMDB_API_KEY;
        if (tmdbKey && tmdbKey !== 'your_tmdb_api_key_here') {
          console.log('[Web App] Running TMDB detection for fallback data...');
          try {
            const summary = await ensureContentTypesWithTMDB(items, '[Web App] Fallback TMDB');
            console.log(`[Web App] Fallback TMDB: ${summary.movies} movies, ${summary.series} series`);
          } catch (error) {
            console.error('[Web App] Error in fallback TMDB detection:', error);
          }
        }
      }
    } else {
      // No worker configured, use direct scraping
      items = await fetchWatchlist(userId);
      refreshSource = 'direct-scrape';

      // Run TMDB detection for direct scrape data
      const tmdbKey = process.env.TMDB_API_KEY;
      if (tmdbKey && tmdbKey !== 'your_tmdb_api_key_here') {
        console.log('[Web App] Running TMDB detection for direct scrape data...');
        try {
          const summary = await ensureContentTypesWithTMDB(items, '[Web App] Direct Scrape TMDB');
          console.log(`[Web App] Direct scrape TMDB: ${summary.movies} movies, ${summary.series} series`);
        } catch (error) {
          console.error('[Web App] Error in direct scrape TMDB detection:', error);
        }
      }
    }

    // Build cache metadata
    const workerMetadata = (items as WorkerWatchlistResult).metadata;
    const now = new Date().toISOString();
    const lastScraped = workerMetadata?.lastScraped || workerMetadata?.cachedAt || now;
    const cacheAge = lastScraped === now ? 0 : Date.now() - new Date(lastScraped as string).getTime();
    const isStale = cacheAge > 6 * 60 * 60 * 1000; // Stale if > 6 hours old

    const response: WatchlistResponse = {
      items,
      totalItems: items.length,
      lastUpdated: new Date().toISOString(),
      userId,
      source: refreshSource,
      cacheMetadata: {
        lastScraped: lastScraped as string,
        cacheAge,
        isStale
      }
    };

    // Smart caching: Enable browser/CDN cache for normal loads, disable for manual refresh
    if (shouldForceRefresh) {
      // Manual refresh: bypass all caches
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('CDN-Cache-Control', 'no-store');
      res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
      res.setHeader('X-Refresh-Triggered', 'manual');
      console.log('[Web App] Cache disabled (manual refresh)');
    } else {
      // Normal load: enable 2-hour browser/CDN cache with stale-while-revalidate
      res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=7200, stale-while-revalidate=86400');
      res.setHeader('CDN-Cache-Control', 'public, max-age=7200');
      res.setHeader('Vercel-CDN-Cache-Control', 'public, max-age=7200');
      res.setHeader('X-Cache-Age', Math.floor(cacheAge / 1000).toString());
      res.setHeader('X-Cache-Status', isStale ? 'stale' : 'fresh');
      console.log('[Web App] Cache enabled (2 hours with stale-while-revalidate)');
    }
    res.setHeader('X-Refresh-Source', refreshSource);
    res.setHeader('Vary', 'Accept');

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching watchlist:', error);

    const message = error instanceof Error ? error.message : '';
    let errorMessage = 'Error desconocido al acceder a la watchlist';

    if (message.includes('net::ERR_NAME_NOT_RESOLVED')) {
      errorMessage = 'No se pudo conectar a IMDb. Verifica tu conexión a internet.';
    } else if (message.includes('404') || message.includes('not found')) {
      errorMessage = 'Usuario no encontrado. Verifica que el User ID sea correcto.';
    } else if (message.includes('privada') || message.includes('private')) {
      errorMessage = message;
    } else if (message.includes('timeout')) {
      errorMessage = 'Tiempo de espera agotado. IMDb puede estar lento, intenta de nuevo.';
    }

    return res.status(500).json({
      error: 'Failed to fetch watchlist',
      message: errorMessage,
      details: process.env.NODE_ENV === 'development' && message ? message : undefined
    });
  }
}
