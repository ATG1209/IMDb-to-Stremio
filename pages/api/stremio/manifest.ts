import { NextApiRequest, NextApiResponse } from 'next';

// Keep this endpoint for backward compatibility but redirect to the
// required .json URL so users copy the correct install link.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Location', '/api/stremio/manifest.json');
  return res.status(308).end();
}
