import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist } from '../../../lib/fetch-watchlist';
import path from 'path';
import fs from 'fs/promises';

// Track last sync time to prevent too frequent syncs
const SYNC_STATE_FILE = path.join(process.cwd(), 'data', 'sync-state.json');
const MIN_SYNC_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

interface SyncState {
  lastSyncTime: string;
  lastSyncSuccess: boolean;
  syncCount: number;
}

async function ensureDataDir() {
  const dataDir = path.dirname(SYNC_STATE_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function loadSyncState(): Promise<SyncState> {
  try {
    const data = await fs.readFile(SYNC_STATE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return {
      lastSyncTime: '1970-01-01T00:00:00.000Z',
      lastSyncSuccess: false,
      syncCount: 0
    };
  }
}

async function saveSyncState(state: SyncState) {
  await ensureDataDir();
  await fs.writeFile(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // This endpoint should be called by external cron services like GitHub Actions,
  // Vercel Cron, or external services like cron-job.org
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Simple authentication (in production, use proper auth)
  const authToken = req.headers.authorization?.replace('Bearer ', '');
  const expectedToken = process.env.CRON_SECRET || 'development-secret';
  
  if (authToken !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const now = new Date();
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
      console.log(`[Cron] Sync request received at ${now.toISOString()}`);
    }

    const syncState = await loadSyncState();
    const lastSyncTime = new Date(syncState.lastSyncTime);
    const timeSinceLastSync = now.getTime() - lastSyncTime.getTime();

    // Prevent too frequent syncs
    if (timeSinceLastSync < MIN_SYNC_INTERVAL) {
      return res.status(200).json({
        skipped: true,
        message: `Sync skipped, last sync was ${Math.round(timeSinceLastSync / 1000 / 60)} minutes ago`,
        nextSyncAvailable: new Date(lastSyncTime.getTime() + MIN_SYNC_INTERVAL).toISOString()
      });
    }

    console.log(`Starting scheduled sync (sync #${syncState.syncCount + 1})`);

    const userId = process.env.DEFAULT_IMDB_USER_ID || 'ur31595220';

    try {
      const items = await fetchWatchlist(userId, { forceRefresh: true });
      const result = {
        totalItems: items.length,
        lastUpdated: new Date().toISOString(),
        items: items.slice(0, 5) // Sample of first 5 items
      };
      
      // Update sync state
      const newState: SyncState = {
        lastSyncTime: now.toISOString(),
        lastSyncSuccess: true,
        syncCount: syncState.syncCount + 1
      };
      
      await saveSyncState(newState);
      
      const syncDuration = Date.now() - now.getTime();

      if (isProduction) {
        console.log(`[Cron] Sync #${newState.syncCount} completed: ${result.totalItems} items in ${syncDuration}ms`);
      } else {
        console.log(`Scheduled sync completed successfully: ${result.totalItems} items`);
      }

      return res.status(200).json({
        success: true,
        message: 'Watchlist synced successfully',
        syncCount: newState.syncCount,
        itemCount: result.totalItems,
        lastUpdated: result.lastUpdated,
        duration: syncDuration
      });
      
    } catch (syncError) {
      // Update sync state with failure
      const newState: SyncState = {
        lastSyncTime: syncState.lastSyncTime, // Keep old time since this failed
        lastSyncSuccess: false,
        syncCount: syncState.syncCount
      };
      
      await saveSyncState(newState);

      throw syncError;
    }
    
  } catch (error) {
    console.error('Scheduled sync failed:', error);
    
    return res.status(500).json({
      error: 'Sync failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}