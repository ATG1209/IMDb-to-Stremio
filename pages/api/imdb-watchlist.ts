import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient } from '../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../lib/fetch-watchlist';

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

  try {
    console.log(`[Web App] Fetching watchlist for user: ${userId}`);

    let items = [];

    // Try VPS worker first, fallback to direct scraping
    const useWorker = process.env.WORKER_URL;

    if (useWorker) {
      try {
        // Check worker health first
        const isWorkerHealthy = await vpsWorkerClient.isHealthy();

        if (isWorkerHealthy) {
          console.log('[Web App] Using VPS worker for web app preview');
          items = await vpsWorkerClient.scrapeWatchlist(userId, { forceRefresh: false });

          // Apply reverse order for newest-first (same fix as catalog)
          items = [...items].reverse();
        } else {
          throw new Error('VPS worker is not healthy');
        }
      } catch (workerError) {
        console.warn(`[Web App] VPS worker failed for ${userId}:`, workerError);

        // Fallback to direct scraping
        console.log('[Web App] Falling back to direct scraping');
        items = await fetchWatchlist(userId);
      }
    } else {
      // No worker configured, use direct scraping
      items = await fetchWatchlist(userId);
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
  }
}