import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const manifest = {
    id: 'org.imdb.watchlist',
    version: '1.0.0',
    name: 'IMDb Watchlist',
    description: 'Access your IMDb watchlist in Stremio',
    logo: 'https://m.media-amazon.com/images/G/01/IMDb/BG_rectangle._CB1509060989_SY230_SX307_AL_.png',
    background: 'https://dl.strem.io/addon-background.jpg',

    // Addon capabilities
    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],

    // Catalog configuration
    catalogs: [
      {
        id: 'imdb-watchlist',
        type: 'movie',
        name: 'My IMDb Watchlist',
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

  return res.status(200).json(manifest);
}

