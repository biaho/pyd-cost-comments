import type { NextFunction, Request, Response } from 'express';

/**
 * This API has exactly one caller (the Vercel-hosted Next.js backend), reached
 * only through the Tailscale Funnel -- not a browser, not a third party. A
 * shared-secret bearer token is the right amount of auth for that shape; a
 * heavier scheme (OAuth, mTLS) would be solving a problem this API doesn't have.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DATA_API_KEY;
  if (!expected) {
    res.status(500).json({ error: 'DATA_API_KEY not configured on this host.' });
    return;
  }

  const header = req.headers.authorization;
  const token = header?.match(/^Bearer (.+)$/)?.[1];

  if (token !== expected) {
    res.status(401).json({ error: 'Missing or invalid Authorization header.' });
    return;
  }

  next();
}
