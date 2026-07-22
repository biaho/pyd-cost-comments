/**
 * No verified auth. Both Windows/AD Integrated Auth (blocked -- IIS URL
 * Rewrite resolves before Windows Auth completes, no supported fix without
 * native code) and Entra ID on-prem (reproduces the same PYD-IT-controlled
 * DNS dependency the on-prem pivot was meant to avoid) were dropped as
 * unworkable for this app. See decisions.log.md 22/07/2026.
 *
 * Two identity sources, in priority order:
 * 1. TARGIT-supplied username (`targitUser` on the launch URL, once TARGIT's
 *    webbox element can pass it -- see decisions.log.md 22/07/2026). Not a
 *    cryptographic guarantee (still just a URL parameter), but materially
 *    harder to fake than free text and stable across the same person's
 *    devices, so it's treated as the trustworthier source when present.
 * 2. Manual typing into the mandatory "Usuario" field -- pure free text,
 *    genuinely fakeable, paired with a random per-browser `clientToken`
 *    (localStorage, see use-client-identity.ts) purely so ownership stays
 *    stable across a single browser's sessions.
 *
 * Nothing privileged depends on identity except the admin usage dashboard,
 * which is gated separately (see admin.ts).
 */
export interface Identity {
  clientToken: string;
  displayName: string;
  targitUsername: string | null;
}

export class AuthError extends Error {}

const CLIENT_TOKEN_PATTERN = /^[a-zA-Z0-9-]{8,64}$/;

/**
 * Reads clientToken/usuario/targitUser from either a URLSearchParams (GET)
 * or a plain body record (POST/DELETE) -- same dual-shape pattern as
 * parseContext in context.ts, so callers can pass whichever they already
 * have in hand. `displayName` may legitimately be empty (a view-only GET
 * before the user has typed anything, and TARGIT hasn't supplied one
 * either); callers that require it (saving a comment) must check that
 * themselves and return their own validation error.
 */
export function resolveIdentity(params: URLSearchParams | Record<string, string | null | undefined>): Identity {
  const get = (key: string): string | undefined => {
    const value = params instanceof URLSearchParams ? params.get(key) : params[key];
    return value ?? undefined;
  };

  const clientToken = get('clientToken');
  if (!clientToken || !CLIENT_TOKEN_PATTERN.test(clientToken)) {
    throw new AuthError('Falta o es inválido el identificador de dispositivo (clientToken).');
  }

  const targitUsername = get('targitUser')?.trim() || null;
  const typedUsuario = get('usuario')?.trim() ?? '';
  const displayName = targitUsername || typedUsuario;

  return { clientToken, displayName, targitUsername };
}
