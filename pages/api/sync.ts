import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist } from '../../lib/fetch-watchlist';

let syncInProgress = false;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Trigger manual sync
    if (syncInProgress) {
      return res.status(429).json({
        error: 'Sync already in progress',
        message: 'Please wait for the current sync to complete'
      });
    }

    try {
      syncInProgress = true;
      console.log('Starting manual watchlist sync...');

      const userId = process.env.DEFAULT_IMDB_USER_ID || 'ur31595220';
      const items = await fetchWatchlist(userId, { forceRefresh: true });

      return res.status(200).json({
        success: true,
        message: 'Watchlist synced successfully',
        totalItems: items.length,
        lastUpdated: new Date().toISOString(),
        data: items.slice(0, 5) // Return first 5 items as preview
      });
    } catch (error) {
      console.error('Sync failed:', error);
      return res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      syncInProgress = false;
    }
  } 
  
  else if (req.method === 'GET') {
    // Get sync status
    return res.status(200).json({
      syncInProgress,
      message: syncInProgress ? 'Sync in progress' : 'No sync running'
    });
  }
  
  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}