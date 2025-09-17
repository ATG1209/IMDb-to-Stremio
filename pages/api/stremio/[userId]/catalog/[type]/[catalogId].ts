import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist, WatchlistItem } from '../../../../../../lib/fetch-watchlist';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId, sortOption, nocache, refresh } = req.query;

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
    const force = (Array.isArray(nocache) ? nocache[0] : nocache) === '1' ||
                  (Array.isArray(refresh) ? refresh[0] : refresh) === '1';
    const watchlistItems = await fetchWatchlist(userId, { forceRefresh: force });
    
    // Filter by content type (items are already in newest-first order from fetch)
    const sortedItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });
    console.log(`[Catalog] Items already in newest-first order. Total items: ${sortedItems.length}, first 3: ${sortedItems.slice(0, 3).map(x => x.title).join(', ')}`);

    // Convert to Stremio catalog format
    const metas = sortedItems.map(item => {
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

    // Set cache headers (allow Stremio to cache briefly)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

    return res.status(200).json({ metas, cacheMaxAge: 60 });

  } catch (error) {
    console.error('Error serving catalog:', error);
    // Return 200 with empty metas to avoid Stremio "Failed to fetch"
    return res.status(200).json({ metas: [], cacheMaxAge: 30 });
  }
}
