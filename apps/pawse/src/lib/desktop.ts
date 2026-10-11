/** What the desktop app's preload (apps/desktop/src/preload.cjs) hands the page; absent in a plain browser. */
type DesktopBridge = {
  /** Opens Google's sign-in window; the YouTube Music cookie header, or null if it was closed. */
  signIn(): Promise<string | null>;
  /** Forgets the sign-in window's Google cookies and the saved session. */
  signOut(): Promise<void>;
  /** The cookie header saved with the OS keychain, or null. */
  readSession(): string | null;
  writeSession(cookies: string | null): void;
};

export const desktop = (globalThis as { pawseDesktop?: DesktopBridge })
  .pawseDesktop;
