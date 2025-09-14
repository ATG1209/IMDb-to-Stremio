import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist, WatchlistItem } from '../../../../../lib/fetch-watchlist';

const DEFAULT_USER_ID = process.env.DEFAULT_IMDB_USER_ID;

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
    if (!DEFAULT_USER_ID) {
      return res.status(200).json({ metas: [], cacheMaxAge: 300 });
    }

    const force = (req.query.nocache === '1' || req.query.refresh === '1');
    const items: WatchlistItem[] = await fetchWatchlist(DEFAULT_USER_ID, { forceRefresh: force });

    const metas = items
      .filter(item => item.type === 'movie')
      .map(item => ({
        id: item.imdbId,
        type: 'movie',
        name: item.title,
        year: item.year,
        poster: item.poster || `https://img.omdbapi.com/?i=${item.imdbId}&apikey=placeholder`,
        description: item.plot || `Added to watchlist on ${new Date(item.addedAt).toLocaleDateString()}`,
        genres: item.genres || ['Unknown'],
        imdbRating: item.rating ? Number(item.rating) : undefined,
        watchlistAdded: item.addedAt
      }));

    return res.status(200).json({ metas, cacheMaxAge: 300 });
  } catch (error) {
    console.error('Error serving catalog:', error);
    return res.status(500).json({ error: 'Failed to load catalog', metas: [], cacheMaxAge: 60 });
  }
}
