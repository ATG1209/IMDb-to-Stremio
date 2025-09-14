import { NextApiRequest, NextApiResponse } from 'next';
import { ADDON_VERSION } from '../../../lib/version';

// Fallback manifest for older installs that used /api/stremio/manifest.json
// Uses DEFAULT_IMDB_USER_ID from env to build a proper manifest
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const defaultUserId = process.env.DEFAULT_IMDB_USER_ID;

  if (!defaultUserId || !/^ur\d+$/.test(defaultUserId)) {
    return res.status(400).json({
      error: 'Missing DEFAULT_IMDB_USER_ID',
      message: 'Set DEFAULT_IMDB_USER_ID=urXXXXXXXX in your environment and re-try, or use /api/stremio/{userId}/manifest.json',
    });
  }

  const manifest = {
    id: `com.imdb.watchlist.sorted.${defaultUserId}`,
    version: ADDON_VERSION,
    name: `IMDb Watchlist SORTED (${defaultUserId})`,
    description: `Tu watchlist personal de IMDb sincronizada automáticamente`,
    logo: 'https://m.media-amazon.com/images/G/01/IMDb/BG_rectangle._CB1509060989_SY230_SX307_AL_.png',
    background: 'https://dl.strem.io/addon-background.jpg',

    resources: ['catalog'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],

    catalogs: [
      {
        id: `imdb-watchlist-${defaultUserId}`,
        type: 'movie',
        name: 'Mi Watchlist - Películas',
        extra: [ { name: 'skip', isRequired: false } ],
      },
      {
        id: `imdb-watchlist-${defaultUserId}`,
        type: 'series',
        name: 'Mi Watchlist - Series',
        extra: [ { name: 'skip', isRequired: false } ],
      },
    ],

    behaviorHints: {
      configurable: false,
      configurationRequired: false,
    },
  };

  // CORS and strong no-cache headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  return res.status(200).json(manifest);
}
