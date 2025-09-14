import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist, WatchlistItem } from '../../../../../../lib/fetch-watchlist';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId, sort } = req.query;

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

    // Sort the filtered items based on sort parameter
    let sortedItems = [...filteredItems];
    const sortBy = sort as string || 'list_order';

    switch (sortBy) {
      case 'alphabetical':
        sortedItems.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'release_date':
        sortedItems.sort((a, b) => {
          const yearA = parseInt(a.year || '0');
          const yearB = parseInt(b.year || '0');
          return yearB - yearA; // Newest first
        });
        break;
      case 'date_added':
        sortedItems.sort((a, b) => {
          return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime(); // Most recent first
        });
        break;
      case 'imdb_rating':
        sortedItems.sort((a, b) => {
          const ratingA = a.imdbRating || 0;
          const ratingB = b.imdbRating || 0;
          return ratingB - ratingA; // Highest rating first
        });
        break;
      case 'popularity':
        sortedItems.sort((a, b) => {
          const popA = a.popularity || 0;
          const popB = b.popularity || 0;
          return popB - popA; // Most popular first
        });
        break;
      case 'num_ratings':
        sortedItems.sort((a, b) => {
          const numA = a.numRatings || 0;
          const numB = b.numRatings || 0;
          return numB - numA; // Most rated first
        });
        break;
      case 'runtime':
        sortedItems.sort((a, b) => {
          const runtimeA = a.runtime || 0;
          const runtimeB = b.runtime || 0;
          return runtimeB - runtimeA; // Longest first
        });
        break;
      case 'your_rating':
        sortedItems.sort((a, b) => {
          const userRatingA = a.userRating || 0;
          const userRatingB = b.userRating || 0;
          return userRatingB - userRatingA; // Highest user rating first
        });
        break;
      case 'list_order':
      default:
        // Maintain original order from IMDb watchlist
        break;
    }

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