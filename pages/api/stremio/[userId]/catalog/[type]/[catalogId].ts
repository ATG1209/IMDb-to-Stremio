import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist, WatchlistItem } from '../../../../../../lib/fetch-watchlist';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  if (!userId.match(/^ur\d+$/)) {
    return res.status(400).json({ error: 'Invalid userId format' });
  }

  // Set CORS headers for Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  try {
    const watchlistItems = await fetchWatchlist(userId);
    
    // Filter by content type
    const filteredItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });

    // Convert to Stremio catalog format
    const metas = filteredItems.map(item => {
      const meta: any = {
        id: item.imdbId,
        type: item.type === 'tv' ? 'series' : 'movie',
        name: item.title,
        description: `Añadido a tu watchlist de IMDb`
      };

      if (item.year) meta.year = parseInt(item.year);
      if (item.poster) meta.poster = item.poster;

      return meta;
    });

    // Set cache headers
    res.setHeader('Cache-Control', 'public, s-maxage=1800'); // Cache for 30 minutes

    return res.status(200).json({
      metas
    });

  } catch (error) {
    console.error('Error serving catalog:', error);
    
    return res.status(500).json({
      metas: []
    });
  }
}