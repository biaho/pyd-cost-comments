import { NextRequest, NextResponse } from 'next/server';

/**
 * TEMPORARY PoC — delete once src/lib/auth.ts is wired to the real IIS header.
 *
 * Echoes every request header so we can see the exact identity value PYD's AD
 * produces through the IIS Windows Authentication reverse proxy (DOMAIN\user vs
 * UPN vs something else) instead of guessing it in the auth parsing logic.
 */
export async function GET(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return NextResponse.json({
    headers,
    hint: 'Look for x-remote-user / x-iis-user / remote-user — that is the value auth.ts must parse.',
  });
}
