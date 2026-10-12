/** What the desktop app's preload (apps/desktop/src/preload.cjs) hands the page; absent in a plain browser. */
type DesktopBridge = {
  /** Opens Google's sign-in window; the YouTube Music cookie header, or null if it was closed. */
  signIn(): Promise<string | null>;
  /** Opens YouTube Music in the default browser. */
  browserOpen(): Promise<void>;
  /** Reads YouTube Music's sign-in from the newest signed-in Firefox profile. */
  browserSignIn(): Promise<{
    cookies?: string;
    browser?: string;
    error?: "no-firefox" | "signed-out";
  }>;
  /** Fresh cookies re-read from Firefox while the app runs; returns an unsubscribe. */
  onSession(cb: (cookies: string) => void): () => void;
  /** Forgets the sign-in window's Google cookies and the saved session. */
  signOut(): Promise<void>;
  /** The cookie header saved with the OS keychain, or null. */
  readSession(): string | null;
  writeSession(cookies: string | null): void;
  /** Runs `code` as an async function body in a hidden youtube.com page of the main process (BotGuard, player challenges). */
  sandboxRun(code: string, timeoutMs?: number): Promise<unknown>;
};

export const desktop = (globalThis as { pawseDesktop?: DesktopBridge })
  .pawseDesktop;
