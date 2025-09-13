import { NextApiRequest, NextApiResponse } from 'next';
import { IMDbSyncService } from '../../lib/imdb-sync';

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

    const syncService = new IMDbSyncService();
    
    try {
      syncInProgress = true;
      console.log('Starting manual watchlist sync...');
      
      const result = await syncService.syncWatchlist();
      
      return res.status(200).json({
        success: true,
        message: 'Watchlist synced successfully',
        data: result
      });
    } catch (error) {
      console.error('Sync failed:', error);
      return res.status(500).json({
        error: 'Sync failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      syncInProgress = false;
      await syncService.cleanup();
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