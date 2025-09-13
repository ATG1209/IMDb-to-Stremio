import { NextApiRequest, NextApiResponse } from 'next';

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
    id: `org.imdb.watchlist.${userId}`,
    version: '1.0.0',
    name: `Mi Watchlist IMDb (${userId})`,
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
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours

  return res.status(200).json(manifest);
}