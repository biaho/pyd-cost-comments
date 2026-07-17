"use client";

import { useEffect, useState } from "react";
import { EventType, InteractionStatus, PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider, useIsAuthenticated, useMsal } from "@azure/msal-react";
import { msalConfig, loginRequest } from "@/lib/msal-config";

// PublicClientApplication touches `window` at construction time -- guarded
// here since Next.js still evaluates this "use client" module during its
// server render pass. `msalInstance` is real by the time any of the effects
// below run (those never execute on the server).
const msalInstance = typeof window !== "undefined" ? new PublicClientApplication(msalConfig) : undefined;

msalInstance?.addEventCallback((event) => {
  if (event.eventType === EventType.LOGIN_SUCCESS && event.payload && "account" in event.payload && event.payload.account) {
    msalInstance.setActiveAccount(event.payload.account);
  }
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { instance, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (!isAuthenticated && inProgress === InteractionStatus.None) {
      instance.loginRedirect(loginRequest);
    }
  }, [isAuthenticated, inProgress, instance]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Redirigiendo a inicio de sesión…</p>
      </div>
    );
  }

  return <>{children}</>;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!msalInstance) return;
    msalInstance.initialize().then(async () => {
      await msalInstance.handleRedirectPromise();
      const accounts = msalInstance.getAllAccounts();
      if (accounts.length > 0 && !msalInstance.getActiveAccount()) {
        msalInstance.setActiveAccount(accounts[0]);
      }
      setInitialized(true);
    });
  }, []);

  if (!initialized || !msalInstance) return null;

  return (
    <MsalProvider instance={msalInstance}>
      <AuthGate>{children}</AuthGate>
    </MsalProvider>
  );
}
