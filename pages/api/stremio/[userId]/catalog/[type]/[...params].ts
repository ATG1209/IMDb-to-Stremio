import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, type, params } = req.query;
  
  // Handle URLs like: /catalog/movie/imdb-watchlist-ur31595220/sort=date_added.json
  // Extract catalogId and sort parameter from the catch-all params
  let catalogId = '';
  let sort = '';
  
  if (Array.isArray(params) && params.length > 0) {
    // Find the catalogId (should contain the userId)
    const catalogParam = params.find(p => p.includes(`imdb-watchlist-${userId}`));
    if (catalogParam) {
      catalogId = catalogParam.replace(/\.json$/, '');
    }
    
    // Find sort parameter 
    const sortParam = params.find(p => p.startsWith('sort='));
    if (sortParam) {
      sort = sortParam.replace('sort=', '').replace(/\.json$/, '');
    }
  }
  
  // If we couldn't parse the parameters properly, return 404
  if (!catalogId || !userId || typeof userId !== 'string') {
    return res.status(404).json({ error: 'Catalog not found' });
  }

  // Redirect to the correct format with query parameters
  const redirectUrl = `/api/stremio/${userId}/catalog/${type}/${catalogId}.json${sort ? `?sort=${sort}` : ''}`;
  
  // Set CORS headers for Stremio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Redirect to the proper endpoint
  return res.redirect(302, redirectUrl);
}