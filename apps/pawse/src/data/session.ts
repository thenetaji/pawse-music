import * as SecureStore from "expo-secure-store";

// The Google session lives in the Keychain / Android Keystore, never in the plain library store.
const KEY = "flow.session";
// Cookie headers run 2–4 KB; stored in chunks to stay under SecureStore's per-value guidance.
const CHUNK = 1800;
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Synchronous so the store has the session before the first request. */
export function readSession(): string | null {
  try {
    const n = Number(SecureStore.getItem(`${KEY}.n`, OPTS));
    if (!n) return null;
    let out = "";
    for (let i = 0; i < n; i++) {
      const part = SecureStore.getItem(`${KEY}.${i}`, OPTS);
      if (part == null) return null;
      out += part;
    }
    return out;
  } catch {
    return null;
  }
}

export function writeSession(cookies: string | null): void {
  try {
    const old = Number(SecureStore.getItem(`${KEY}.n`, OPTS)) || 0;
    const parts: string[] = [];
    for (let i = 0; cookies && i < cookies.length; i += CHUNK)
      parts.push(cookies.slice(i, i + CHUNK));
    parts.forEach((p, i) => SecureStore.setItem(`${KEY}.${i}`, p, OPTS));
    SecureStore.setItem(`${KEY}.n`, String(parts.length), OPTS);
    for (let i = parts.length; i < old; i++)
      void SecureStore.deleteItemAsync(`${KEY}.${i}`, OPTS).catch(() => {});
  } catch {
    // A locked keychain keeps the in-memory session for this run.
  }
}
