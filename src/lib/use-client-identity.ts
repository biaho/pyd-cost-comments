"use client";

import { useCallback, useEffect, useState } from "react";

const CLIENT_TOKEN_KEY = "pyd-cost-comments:clientToken";
const USUARIO_KEY = "pyd-cost-comments:usuario";

function getOrCreateClientToken(): string {
  let token = localStorage.getItem(CLIENT_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(CLIENT_TOKEN_KEY, token);
  }
  return token;
}

/**
 * No auth (see src/lib/auth.ts) -- clientToken is a random id generated once
 * per browser and persisted in localStorage, purely so the same visitor's
 * comment ownership stays stable across sessions. `usuario` is just the name
 * they last typed into the mandatory composer field, repopulated here as a
 * convenience so they don't have to retype it every visit -- not itself a
 * verified identity, and always editable.
 */
export function useClientIdentity() {
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [usuario, setUsuarioState] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setClientToken(getOrCreateClientToken());
    setUsuarioState(localStorage.getItem(USUARIO_KEY) ?? "");
    setReady(true);
  }, []);

  const setUsuario = useCallback((value: string) => {
    setUsuarioState(value);
    localStorage.setItem(USUARIO_KEY, value);
  }, []);

  return { clientToken, usuario, setUsuario, ready };
}
