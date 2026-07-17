import type { MockIdentity } from './mock-auth';

/**
 * Single admin for the usage dashboard. Swappable via env var without a code
 * change once Entra ID SSO replaces mock-auth -- the identity shape (UPN)
 * stays the same either way.
 */
const ADMIN_USER_PRINCIPAL_NAME = process.env.ADMIN_USER_PRINCIPAL_NAME || 'aitor@pyd.es';

export function isAdmin(identity: MockIdentity): boolean {
  return identity.userPrincipalName.toLowerCase() === ADMIN_USER_PRINCIPAL_NAME.toLowerCase();
}
