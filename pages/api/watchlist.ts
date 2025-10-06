import { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs/promises';

interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  imdbRating?: number;
  numRatings?: number;
  runtime?: number;
  popularity?: number;
  userRating?: number;
  addedAt: string;
}

interface WatchlistCache {
  items: WatchlistItem[];
  lastUpdated: string;
  totalItems: number;
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'watchlist-cache.json');

async function ensureDataDir() {
  const dataDir = path.dirname(CACHE_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function loadWatchlistCache(): Promise<WatchlistCache | null> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    console.log('No cached watchlist found, returning empty');
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cachedData = await loadWatchlistCache();
    
    if (!cachedData) {
      return res.status(200).json({
        items: [],
        lastUpdated: null,
        totalItems: 0,
        message: 'No watchlist data cached yet. Configure IMDb sync first.'
      });
    }

    // Add cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=300'); // Cache for 5 minutes
    
    return res.status(200).json(cachedData);
  } catch (error) {
    console.error('Error loading watchlist:', error);
    return res.status(500).json({ 
      error: 'Failed to load watchlist data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}