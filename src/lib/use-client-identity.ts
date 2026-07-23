"use client";

import { useCallback, useEffect, useState } from "react";

const CLIENT_TOKEN_KEY = "pyd-cost-comments:clientToken";
const USUARIO_KEY = "pyd-cost-comments:usuario";

/**
 * crypto.randomUUID() is exposed ONLY in secure contexts (HTTPS or
 * localhost). This app is served over plain HTTP on a LAN hostname
 * (http://PERDIS032), so on every real user's browser it is `undefined` --
 * calling it threw "crypto.randomUUID is not a function" and took the whole
 * React tree down on hydration (22/07/2026; invisible during development
 * because localhost IS a secure context).
 *
 * crypto.getRandomValues() is NOT secure-context-gated, so it works
 * everywhere and stays a real CSPRNG. Format matches UUID v4 so the token
 * keeps satisfying auth.ts's CLIENT_TOKEN_PATTERN either way.
 */
function randomUuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10x
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateClientToken(): string {
  let token = localStorage.getItem(CLIENT_TOKEN_KEY);
  if (!token) {
    token = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : randomUuidV4();
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
