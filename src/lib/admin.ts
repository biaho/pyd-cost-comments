import type { Identity } from './auth';

/** Single admin for the usage dashboard, swappable via env var. */
const ADMIN_USER_PRINCIPAL_NAME = process.env.ADMIN_USER_PRINCIPAL_NAME || 'aitor@pyd.es';

export function isAdmin(identity: Identity): boolean {
  return identity.userPrincipalName.toLowerCase() === ADMIN_USER_PRINCIPAL_NAME.toLowerCase();
}
