import { NextApiRequest, NextApiResponse } from 'next';
import { vpsWorkerClient } from '../../lib/vpsWorkerClient';
import { fetchWatchlist } from '../../lib/fetch-watchlist'; // Fallback

let syncInProgress = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Trigger sync using VPS worker
    if (syncInProgress) {
      return res.status(429).json({
        error: 'Sync already in progress',
        message: 'Please wait for the current sync to complete'
      });
    }

    try {
      syncInProgress = true;
      const { forceRefresh = false } = req.body;
      const userId = process.env.DEFAULT_IMDB_USER_ID || 'ur31595220';

      console.log(`[Sync] Starting VPS-based sync for user ${userId}...`);

      // Check if VPS worker is available
      const isWorkerHealthy = await vpsWorkerClient.isHealthy();

      let items = [];
      let source = 'unknown';

      if (isWorkerHealthy && process.env.WORKER_URL) {
        // Use VPS worker
        try {
          items = await vpsWorkerClient.scrapeWatchlist(userId, { forceRefresh });
          source = 'vps-worker';
          console.log(`[Sync] VPS worker returned ${items.length} items`);
        } catch (workerError) {
          console.error('[Sync] VPS worker failed:', workerError);

          // Fallback to direct scraping in development
          if (process.env.NODE_ENV !== 'production') {
            console.log('[Sync] Falling back to direct scraping...');
            items = await fetchWatchlist(userId, { forceRefresh });
            source = 'fallback-direct';
          } else {
            throw workerError;
          }
        }
      } else {
        if (process.env.NODE_ENV !== 'production') {
          // Development fallback
          console.log('[Sync] VPS worker not available, using direct scraping in development...');
          items = await fetchWatchlist(userId, { forceRefresh });
          source = 'development-direct';
        } else {
          throw new Error('VPS worker is not available and no fallback configured for production');
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Watchlist synced successfully',
        totalItems: items.length,
        lastUpdated: new Date().toISOString(),
        source,
        data: items.slice(0, 5), // First 5 items as preview
        debug: {
          workerUrl: process.env.WORKER_URL,
          workerHealthy: isWorkerHealthy,
          userId,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      return res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      syncInProgress = false;
    }
  }

  else if (req.method === 'GET') {
    // Get sync status
    return res.status(200).json({
      syncInProgress,
      message: syncInProgress ? 'Sync in progress' : 'No sync running',
      workerUrl: process.env.WORKER_URL,
      workerHealthy: await vpsWorkerClient.isHealthy()
    });
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}