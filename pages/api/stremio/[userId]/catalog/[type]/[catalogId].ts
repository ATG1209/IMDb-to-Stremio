import { NextApiRequest, NextApiResponse } from 'next';
import { fetchWatchlist, WatchlistItem } from '../../../../../../lib/fetch-watchlist';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, catalogId, sort, nocache, refresh } = req.query;

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
    
    // Filter by content type
    const filteredItems = watchlistItems.filter(item => {
      if (type === 'movie') return item.type === 'movie';
      if (type === 'series') return item.type === 'tv';
      return true;
    });

    // Default to 'date_added' order (newest first)
    let sortedItems = [...filteredItems];
    const sortParam = Array.isArray(sort) ? sort[0] : sort;
    const sortBy = (typeof sortParam === 'string' ? sortParam.toLowerCase() : 'date_added') || 'date_added';
    
    console.log(`[Catalog] Sort parameter received: "${sort}" -> normalized: "${sortBy}" for ${sortedItems.length} items`);
    
    // Debug: Show sample data for metadata fields
    if (sortedItems.length > 0) {
      const sample = sortedItems[0];
      console.log(`[Catalog] Sample item metadata:`, {
        title: sample.title,
        imdbRating: sample.imdbRating,
        numRatings: sample.numRatings,
        runtime: sample.runtime,
        popularity: sample.popularity,
        userRating: sample.userRating,
        hasData: {
          imdbRating: (sample.imdbRating ?? 0) > 0,
          numRatings: (sample.numRatings ?? 0) > 0,
          runtime: (sample.runtime ?? 0) > 0,
          popularity: (sample.popularity ?? 0) > 0,
          userRating: (sample.userRating ?? 0) > 0,
        }
      });
    }

    switch (sortBy) {
      case 'alphabetical':
        sortedItems.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'release_date':
        sortedItems.sort((a, b) => {
          const yearA = parseInt(a.year || '0', 10) || 0;
          const yearB = parseInt(b.year || '0', 10) || 0;
          return yearB - yearA; // Newest first
        });
        break;
      case 'date_added':
        // Sort by addedAt timestamp, newest first (desc)
        sortedItems.sort((a, b) => {
          const dateA = new Date(a.addedAt || 0).getTime();
          const dateB = new Date(b.addedAt || 0).getTime();
          return dateB - dateA; // Newest first
        });
        break;
      case 'imdb_rating':
        sortedItems.sort((a, b) => {
          const ratingA = Number(a.imdbRating) || 0;
          const ratingB = Number(b.imdbRating) || 0;
          // Secondary sort by title for consistent ordering when ratings are equal
          if (ratingA === ratingB) {
            return (a.title || '').localeCompare(b.title || '');
          }
          return ratingB - ratingA; // Highest rating first
        });
        break;
      case 'popularity':
        sortedItems.sort((a, b) => {
          const popA = Number(a.popularity) || 0;
          const popB = Number(b.popularity) || 0;
          // Secondary sort by IMDb rating when popularity is equal
          if (popA === popB) {
            const ratingA = Number(a.imdbRating) || 0;
            const ratingB = Number(b.imdbRating) || 0;
            return ratingB - ratingA;
          }
          return popB - popA; // Most popular first
        });
        break;
      case 'num_ratings':
        sortedItems.sort((a, b) => {
          const numA = Number(a.numRatings) || 0;
          const numB = Number(b.numRatings) || 0;
          // Secondary sort by IMDb rating when vote counts are equal
          if (numA === numB) {
            const ratingA = Number(a.imdbRating) || 0;
            const ratingB = Number(b.imdbRating) || 0;
            return ratingB - ratingA;
          }
          return numB - numA; // Most rated first
        });
        break;
      case 'runtime':
        sortedItems.sort((a, b) => {
          const runtimeA = Number(a.runtime) || 0;
          const runtimeB = Number(b.runtime) || 0;
          // Secondary sort by title when runtimes are equal
          if (runtimeA === runtimeB) {
            return (a.title || '').localeCompare(b.title || '');
          }
          return runtimeB - runtimeA; // Longest first
        });
        break;
      case 'your_rating':
        sortedItems.sort((a, b) => {
          const userRatingA = Number(a.userRating) || 0;
          const userRatingB = Number(b.userRating) || 0;
          // Secondary sort by IMDb rating when user ratings are equal
          if (userRatingA === userRatingB) {
            const ratingA = Number(a.imdbRating) || 0;
            const ratingB = Number(b.imdbRating) || 0;
            return ratingB - ratingA;
          }
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

    // Set cache headers (allow Stremio to cache briefly)
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');

    return res.status(200).json({ metas, cacheMaxAge: 60 });

  } catch (error) {
    console.error('Error serving catalog:', error);
    // Return 200 with empty metas to avoid Stremio "Failed to fetch"
    return res.status(200).json({ metas: [], cacheMaxAge: 30 });
  }
}
