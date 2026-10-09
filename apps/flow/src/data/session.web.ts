// Web has no keychain; the session stays in localStorage under its own key.
const KEY = "flow.session.cookies";
const ls = () => (typeof localStorage === "undefined" ? undefined : localStorage);

export function readSession(): string | null {
  return ls()?.getItem(KEY) ?? null;
}

export function writeSession(cookies: string | null): void {
  if (cookies) ls()?.setItem(KEY, cookies);
  else ls()?.removeItem(KEY);
}
