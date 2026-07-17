"use client";

import { useCallback } from "react";
import { useMsal } from "@azure/msal-react";
import { loginRequest } from "./msal-config";

/** Returns the current user's ID token (backend's trust boundary, see src/lib/auth.ts). */
export function useAuthToken() {
  const { instance, accounts } = useMsal();

  return useCallback(async (): Promise<string> => {
    const account = accounts[0];
    if (!account) throw new Error("No hay una sesión activa.");
    const result = await instance.acquireTokenSilent({ ...loginRequest, account });
    return result.idToken;
  }, [instance, accounts]);
}
