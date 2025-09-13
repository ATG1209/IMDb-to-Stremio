import { NextApiRequest, NextApiResponse } from 'next';
import { saveCredentials, hasCredentials, getCredentials, clearCredentials } from '../../lib/storage';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    // Save IMDb credentials
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Both email and password are required'
      });
    }

    try {
      await saveCredentials(email, password);
      
      return res.status(200).json({
        success: true,
        message: 'IMDb credentials saved successfully'
      });
    } catch (error) {
      console.error('Error saving credentials:', error);
      return res.status(500).json({
        error: 'Failed to save credentials',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  else if (req.method === 'GET') {
    // Check if credentials are configured
    try {
      const configured = await hasCredentials();
      const credentials = configured ? await getCredentials() : null;
      
      return res.status(200).json({
        configured,
        email: credentials?.email ? credentials.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
        message: configured ? 'Credentials configured' : 'No credentials configured'
      });
    } catch (error) {
      console.error('Error loading credentials:', error);
      return res.status(500).json({
        error: 'Failed to check credentials',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  else if (req.method === 'DELETE') {
    // Delete credentials
    try {
      await clearCredentials();
      return res.status(200).json({
        success: true,
        message: 'Credentials cleared successfully'
      });
    } catch (error) {
      console.error('Error clearing credentials:', error);
      return res.status(500).json({
        error: 'Failed to clear credentials',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}