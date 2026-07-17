import { NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Real Entra ID identity, replacing src/lib/mock-auth.ts's MockIdentity now
 * that the tenant admin has granted consent (see decisions.log.md 17/07/2026).
 * Same shape as MockIdentity on purpose -- comments.ts/admin.ts didn't need to change.
 */
export interface Identity {
  entraObjectId: string;
  userPrincipalName: string;
  displayName: string;
}

export class AuthError extends Error {}

const TENANT_ID = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
const CLIENT_ID = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;

if (!TENANT_ID || !CLIENT_ID) {
  throw new Error('NEXT_PUBLIC_AZURE_AD_TENANT_ID / NEXT_PUBLIC_AZURE_AD_CLIENT_ID must be set.');
}

const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;

// Cached across invocations -- fetches Entra's signing keys lazily and refreshes on kid miss.
const jwks = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`)
);

/**
 * Verifies the frontend's MSAL ID token (not a separate access token -- this
 * app has no exposed API scope, only the default `User.Read` Graph permission,
 * so the ID token's own signature/issuer/audience checks are the trust
 * boundary). Extracts the same three claims MockIdentity used to fabricate.
 */
export async function resolveIdentity(req: NextRequest): Promise<Identity> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.match(/^Bearer (.+)$/)?.[1];
  if (!token) {
    throw new AuthError('Falta la cabecera Authorization: Bearer <token>.');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: CLIENT_ID }));
  } catch {
    throw new AuthError('Token de sesión inválido o caducado. Inicia sesión de nuevo.');
  }

  const entraObjectId = payload.oid;
  const userPrincipalName = payload.preferred_username ?? payload.upn;
  const displayName = payload.name;

  if (typeof entraObjectId !== 'string' || typeof userPrincipalName !== 'string') {
    throw new AuthError('El token no contiene los claims esperados (oid, preferred_username).');
  }

  return {
    entraObjectId,
    userPrincipalName,
    displayName: typeof displayName === 'string' ? displayName : userPrincipalName,
  };
}
