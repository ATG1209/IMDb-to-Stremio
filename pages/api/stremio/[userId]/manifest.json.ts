import { NextApiRequest, NextApiResponse } from 'next';
import { ADDON_VERSION } from '../../../../lib/version';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  // Validate user ID format
  if (!userId.match(/^ur\d+$/)) {
    return res.status(400).json({
      error: 'Invalid userId format',
      message: 'User ID must start with "ur" followed by numbers'
    });
  }

  const manifest = {
    id: `com.imdb.watchlist.sorted.${userId}`,
    version: ADDON_VERSION,
    name: `IMDb Watchlist SORTED (${userId})`,
    description: `Tu watchlist personal de IMDb sincronizada automáticamente`,
    logo: 'https://m.media-amazon.com/images/G/01/IMDb/BG_rectangle._CB1509060989_SY230_SX307_AL_.png',
    background: 'https://dl.strem.io/addon-background.jpg',
    
    // Addon capabilities
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    
    // Catalog configuration
    catalogs: [
      {
        id: `imdb-watchlist-${userId}`,
        type: 'movie',
        name: 'Mi Watchlist - Películas',
        extra: [
          {
            name: 'skip',
            isRequired: false
          },
          {
            name: 'sort',
            isRequired: false,
            options: [
              'list_order',
              'alphabetical', 
              'imdb_rating',
              'popularity',
              'num_ratings',
              'release_date',
              'runtime',
              'date_added',
              'your_rating'
            ],
            optionsLimit: 1
          }
        ]
      },
      {
        id: `imdb-watchlist-${userId}`,
        type: 'series',
        name: 'Mi Watchlist - Series',
        extra: [
          {
            name: 'skip',
            isRequired: false
          },
          {
            name: 'sort',
            isRequired: false,
            options: [
              'list_order',
              'alphabetical',
              'imdb_rating', 
              'popularity',
              'num_ratings',
              'release_date',
              'runtime',
              'date_added',
              'your_rating'
            ],
            optionsLimit: 1
          }
        ]
      }
    ],
    
    // Addon metadata
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };

  // Set CORS headers for Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  // Strongly disable any caching layers (client, proxy, CDN)
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  return res.status(200).json(manifest);
}
