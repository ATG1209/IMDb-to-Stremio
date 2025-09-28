import { logger } from '../utils/logger.js';

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or invalid authorization header', {
      path: req.path,
      method: req.method
    });

    return res.status(401).json({
      success: false,
      error: 'Invalid authentication',
      message: 'Missing or invalid bearer token'
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.WORKER_SECRET || 'worker-secret';

  if (token !== expectedToken) {
    logger.warn('Invalid token provided', {
      path: req.path,
      method: req.method,
      providedToken: token.substring(0, 8) + '...'
    });

    return res.status(401).json({
      success: false,
      error: 'Invalid authentication',
      message: 'Invalid bearer token'
    });
  }

  logger.debug('Authentication successful', {
    path: req.path,
    method: req.method
  });

  next();
}