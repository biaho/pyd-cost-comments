import { NextRequest } from 'next/server';

/**
 * With no verified user identity (see auth.ts), the admin dashboard can no
 * longer gate on a UPN match. Stopgap: a shared secret handed out of band
 * (not a per-user identity), passed as ?key= on the /admin/usage URL and
 * forwarded to this API. Flagged as a stopgap, not a final design -- worth
 * revisiting (e.g. IP allowlist, or Windows-Auth-free route protection at
 * the IIS layer) if the dashboard needs stronger access control later.
 */
const ADMIN_ACCESS_KEY = process.env.ADMIN_ACCESS_KEY;

export function isAdminRequest(req: NextRequest): boolean {
  if (!ADMIN_ACCESS_KEY) return false;
  return req.nextUrl.searchParams.get('key') === ADMIN_ACCESS_KEY;
}
