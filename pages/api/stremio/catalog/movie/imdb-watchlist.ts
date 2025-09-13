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
  addedAt: string;
}

interface WatchlistCache {
  items: WatchlistItem[];
  lastUpdated: string;
  totalItems: number;
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'watchlist-cache.json');

async function loadWatchlistCache(): Promise<WatchlistCache | null> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set CORS headers for Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    const cachedData = await loadWatchlistCache();
    
    if (!cachedData || !cachedData.items) {
      return res.status(200).json({
        metas: [],
        cacheMaxAge: 300 // 5 minutes
      });
    }

    // Convert watchlist items to Stremio catalog format
    const metas = cachedData.items
      .filter(item => item.type === 'movie') // Only movies for this catalog
      .map(item => ({
        id: item.imdbId,
        type: 'movie',
        name: item.title,
        year: item.year,
        poster: item.poster || `https://img.omdbapi.com/?i=${item.imdbId}&apikey=placeholder`,
        description: item.plot || `Added to watchlist on ${new Date(item.addedAt).toLocaleDateString()}`,
        genres: item.genres || ['Unknown'],
        imdbRating: undefined, // Could be fetched separately
        
        // Additional metadata
        watchlistAdded: item.addedAt
      }));

    return res.status(200).json({
      metas,
      cacheMaxAge: 300 // Cache for 5 minutes
    });

  } catch (error) {
    console.error('Error serving catalog:', error);
    return res.status(500).json({
      error: 'Failed to load catalog',
      metas: [],
      cacheMaxAge: 60
    });
  }
}