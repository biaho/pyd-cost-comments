import { Configuration, LogLevel } from '@azure/msal-browser';

const clientId = process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
const tenantId = process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID;
const redirectUri = process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || 'http://localhost:3000';

if (!clientId || !tenantId) {
  throw new Error('NEXT_PUBLIC_AZURE_AD_CLIENT_ID / NEXT_PUBLIC_AZURE_AD_TENANT_ID must be set.');
}

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error) console.error(message);
      },
    },
  },
};

// Only User.Read is consented tenant-wide (see decisions.log.md 17/07/2026) --
// this is also all the app needs, since the backend validates the ID token,
// not a separate access token for a custom API scope.
export const loginRequest = { scopes: ['User.Read'] };
