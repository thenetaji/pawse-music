import { desktop } from "../lib/desktop";
import { kv } from "./storage";

// The desktop app keeps the session encrypted with the OS keychain; a plain browser has only localStorage.
const KEY = "pawse.session.cookies";

export function readSession(): string | null {
  if (desktop) {
    const legacy = kv.getItem(KEY);
    if (typeof legacy === "string") {
      // Moves a session saved before encryption into the keychain.
      desktop.writeSession(legacy);
      void kv.removeItem(KEY);
      return legacy;
    }
    return desktop.readSession();
  }
  const raw = kv.getItem(KEY);
  return typeof raw === "string" ? raw : null;
}

export function writeSession(cookies: string | null): void {
  if (desktop) return desktop.writeSession(cookies);
  if (cookies) void kv.setItem(KEY, cookies);
  else void kv.removeItem(KEY);
}
