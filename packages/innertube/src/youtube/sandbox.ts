/** Runs JS in a real browser engine (hidden WebView on phones, hidden window on computers) whose origin is https://www.youtube.com. */
export interface JsSandbox {
  /** Evaluates `code` as the body of an async function; resolves with its JSON-serialisable return value. */
  run<T = unknown>(code: string, timeoutMs?: number): Promise<T>;
}

/** BotGuard Proof-of-Origin tokens for web clients, minted in the sandbox. */
export interface PoTokenProvider {
  /** Visitor id the tokens belong to; send it as visitorData / X-Goog-Visitor-Id on every PO-token request. */
  visitorData(): Promise<string | undefined>;
  /** Token for `binding` (a video id or the visitorData); undefined when BotGuard is unavailable. */
  mint(binding: string): Promise<string | undefined>;
  /** YouTube refused a token: drop the minter so the next mint starts fresh. */
  reportRejected?(): void;
}
