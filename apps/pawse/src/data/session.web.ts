import { kv } from "./storage";

// Web has no keychain; the session stays in localStorage under its own key.
const KEY = "pawse.session.cookies";

export function readSession(): string | null {
  const raw = kv.getItem(KEY);
  return typeof raw === "string" ? raw : null;
}

export function writeSession(cookies: string | null): void {
  if (cookies) void kv.setItem(KEY, cookies);
  else void kv.removeItem(KEY);
}
