import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient, WorkerPendingError, WorkerWatchlistResult } from '../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../lib/fetch-watchlist';
import { detectContentTypeBatch } from '../../lib/tmdb';

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
  source: string;
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

          // CRITICAL FIX: Detect correct content types using TMDB
          // The VPS worker may not have run content type detection
          const tmdbKey = process.env.TMDB_API_KEY;
          console.log(`[Web App] TMDB API Key status: ${tmdbKey ? 'SET (length: ' + tmdbKey.length + ')' : 'MISSING ❌'}`);

          if (!tmdbKey || tmdbKey === 'your_tmdb_api_key_here') {
            console.error('[Web App] ❌ CRITICAL: TMDB_API_KEY not configured! Content type detection will fail.');
            console.error('[Web App] Set TMDB_API_KEY in Vercel environment variables.');
          } else {
            console.log('[Web App] Detecting content types for worker items...');
            try {
              const beforeCount = {
                movies: items.filter(i => i.type === 'movie').length,
                series: items.filter(i => i.type === 'tv').length
              };
              console.log(`[Web App] BEFORE detection: ${beforeCount.movies} movies, ${beforeCount.series} series`);

              const contentTypes = await detectContentTypeBatch(
                items.map(item => ({ title: item.title, year: item.year }))
              );

              console.log(`[Web App] TMDB returned ${contentTypes.size} type mappings`);

              // Update content types based on TMDB detection
              let updatedCount = 0;
              items.forEach(item => {
                const key = `${item.title}_${item.year || 'unknown'}`;
                const detectedType = contentTypes.get(key);
                if (detectedType) {
                  if (item.type !== detectedType) {
                    updatedCount++;
                  }
                  item.type = detectedType;
                }
              });

              const afterCount = {
                movies: items.filter(i => i.type === 'movie').length,
                series: items.filter(i => i.type === 'tv').length
              };
              console.log(`[Web App] AFTER detection: ${afterCount.movies} movies, ${afterCount.series} series`);
              console.log(`[Web App] Updated ${updatedCount} item types`);
            } catch (error) {
              console.error('[Web App] ❌ Error detecting content types:', error);
              console.error('[Web App] Error details:', error instanceof Error ? error.message : String(error));
            }
          }
        } else {
          throw new Error('VPS worker is not healthy');
        }
      } catch (workerError) {
        console.warn(`[Web App] VPS worker failed for ${userId}:`, workerError);

        // Fallback to direct scraping
        console.log('[Web App] Falling back to direct scraping');
        items = await fetchWatchlist(userId);
        refreshSource = workerError instanceof WorkerPendingError ? 'fallback-after-worker-pending' : 'fallback-direct';
      }
    } else {
      // No worker configured, use direct scraping
      items = await fetchWatchlist(userId);
      refreshSource = 'direct-scrape';
    }

    const response: WatchlistResponse = {
      items,
      totalItems: items.length,
      lastUpdated: new Date().toISOString(),
      userId,
      source: refreshSource
    };

    // Set cache headers - bypass cache on force refresh
    if (shouldForceRefresh) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.setHeader('CDN-Cache-Control', 'no-store');
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=1800'); // Cache for 30 minutes
    }
    res.setHeader('X-Refresh-Source', refreshSource);

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
