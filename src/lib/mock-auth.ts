/**
 * TEMPORARY mock identity layer. MS is still evaluating the Phase 1 auth
 * mechanism (Entra ID SSO vs. a standalone app_user table) -- see
 * decisions.log.md 17/07/2026. This lets backend/API development continue
 * without that decision landing first. Swap `resolveMockIdentity` for real
 * token verification (MSAL) or custom-login lookup once decided -- nothing
 * in the API routes should need to change, since they only depend on this
 * function's return shape.
 */
export interface MockIdentity {
  entraObjectId: string;
  userPrincipalName: string;
  displayName: string;
}

const MOCK_USERS: Record<string, MockIdentity> = {
  manuelsa: {
    entraObjectId: 'mock-manuelsa-0001',
    userPrincipalName: 'manuelsa@pyd.es',
    displayName: 'Manuel Sanchez (mock)',
  },
  testuser2: {
    entraObjectId: 'mock-testuser2-0002',
    userPrincipalName: 'testuser2@pyd.es',
    displayName: 'Test User 2 (mock)',
  },
};

export function resolveMockIdentity(asUser: string | null): MockIdentity {
  const key = asUser && MOCK_USERS[asUser] ? asUser : 'manuelsa';
  return MOCK_USERS[key];
}
