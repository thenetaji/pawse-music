// BotGuard PO tokens on top of any JsSandbox. Flow after Metrolist's PoTokenWebView (GPL-3.0) and BgUtils
// (LuanRT, MIT); homepage challenge + ytcfg per ReactTube's finding that bare Create tokens stay ATTESTATION_PENDING.
import { type FetchLike, fetchWithTimeout } from "../../util/http";
import type { JsSandbox, PoTokenProvider } from "../sandbox";
import {
  type BgChallenge,
  parseCreate,
  parseHomepage,
  parseIntegrityToken,
} from "./challenge";
import { BOTGUARD_PAGE_JS } from "./page";

const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const GOOGLE_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const JNN = "https://www.youtube.com/api/jnn/v1";
const HOME = "https://www.youtube.com/";
const VISITOR_URL =
  "https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false";
const WEB_CLIENT_VERSION = "2.20261009.01.00";
const FETCH_TIMEOUT_MS = 10_000;
const INIT_TIMEOUT_MS = 20_000;
const BOTGUARD_TIMEOUT_MS = 12_000;
const MINT_TIMEOUT_MS = 8_000;
const RENEW_EARLY_MS = 10 * 60_000;
const COOLDOWN_MS = 60_000;
const DEFAULT_TTL_SEC = 6 * 3600;

/** Safari on macOS, as the phones' WebView presents itself (and as SmartTube/ReactTube do). */
export const SANDBOX_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

export interface WebPoTokenOptions {
  fetch: FetchLike;
  sandbox: JsSandbox;
  now?: () => number;
  log?: (message: string) => void;
}

interface Session {
  visitorData?: string;
  ytcfg?: Record<string, unknown>;
  createdAt: number;
  renewAt: number;
  tokens: Map<string, string>;
}

class PoTokenError extends Error {}

/** PoTokenProvider minting in a sandbox page; phones and desktop share this, only the sandbox differs. */
export class WebPoTokenProvider implements PoTokenProvider {
  private readonly f: FetchLike;
  private readonly sandbox: JsSandbox;
  private readonly now: () => number;
  private readonly log: (m: string) => void;
  private current?: Session;
  private starting?: Promise<Session | undefined>;
  private cooldownUntil = 0;

  constructor(o: WebPoTokenOptions) {
    this.f = o.fetch;
    this.sandbox = o.sandbox;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? (() => {});
  }

  async visitorData(): Promise<string | undefined> {
    return (await this.session())?.visitorData;
  }

  /** The challenge page's ytcfg (STS, EVENT_ID...), once a session exists. */
  async ytcfg(): Promise<Record<string, unknown> | undefined> {
    return (await this.session())?.ytcfg;
  }

  async mint(binding: string): Promise<string | undefined> {
    if (!binding) return undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const s = await this.session();
      if (!s) return undefined;
      const hit = s.tokens.get(binding);
      if (hit) return hit;
      try {
        const t = await this.sandbox.run<string>(
          `return __pawseBg.mint(${JSON.stringify(binding)});`,
          MINT_TIMEOUT_MS,
        );
        if (typeof t !== "string" || !t) throw new PoTokenError("empty token");
        s.tokens.set(binding, t);
        return t;
      } catch (e) {
        this.log(`mint failed: ${msg(e)}`);
        if (this.current === s) this.current = undefined;
        // A fresh minter failing means the page itself is broken; an older one may just have lost its page.
        if (this.now() - s.createdAt < MINT_TIMEOUT_MS * 2) {
          this.cooldownUntil = this.now() + COOLDOWN_MS;
          return undefined;
        }
      }
    }
    return undefined;
  }

  reportRejected(): void {
    const s = this.current;
    this.current = undefined;
    // Rejected straight after a fresh start: BotGuard does not trust this page, so back off.
    if (s && this.now() - s.createdAt < COOLDOWN_MS)
      this.cooldownUntil = this.now() + COOLDOWN_MS;
  }

  private session(): Promise<Session | undefined> {
    const s = this.current;
    if (s && this.now() < s.renewAt) return Promise.resolve(s);
    this.current = undefined;
    if (this.now() < this.cooldownUntil) return Promise.resolve(undefined);
    if (!this.starting) {
      this.starting = this.start().finally(() => {
        this.starting = undefined;
      });
    }
    return this.starting;
  }

  private async start(): Promise<Session | undefined> {
    const started = this.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const s = await Promise.race([
        this.init(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new PoTokenError("BotGuard start timed out")),
            INIT_TIMEOUT_MS,
          );
        }),
      ]);
      this.current = s;
      this.log(`minter ready in ${this.now() - started} ms`);
      return s;
    } catch (e) {
      this.log(`BotGuard unavailable: ${msg(e)}`);
      this.cooldownUntil = this.now() + COOLDOWN_MS;
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private async init(): Promise<Session> {
    const ua = await this.sandbox.run<string>("return navigator.userAgent;", 5000);
    let ch = await this.homepage(ua).catch((e) => {
      this.log(`homepage challenge failed: ${msg(e)}`);
      return undefined;
    });
    ch ??= await this.create(ua);
    const visitorData =
      str(ch.ytcfg?.VISITOR_DATA) ?? (await this.fetchVisitorData(ua));
    const response = await this.sandbox.run<string>(
      `${BOTGUARD_PAGE_JS}\nreturn __pawseBg.start(${JSON.stringify({ ...ch, timeoutMs: BOTGUARD_TIMEOUT_MS - 1000 })});`,
      BOTGUARD_TIMEOUT_MS,
    );
    const it = parseIntegrityToken(
      await this.post(`${JNN}/GenerateIT`, [REQUEST_KEY, response], ua),
    );
    if (!it) throw new PoTokenError("GenerateIT gave no integrity token");
    await this.sandbox.run(
      `return __pawseBg.unlock(${JSON.stringify(it.token)});`,
      BOTGUARD_TIMEOUT_MS,
    );
    const now = this.now();
    const ttlMs = (it.ttlSec || DEFAULT_TTL_SEC) * 1000;
    return {
      visitorData,
      ytcfg: ch.ytcfg,
      createdAt: now,
      // Renew 10 minutes early; very short lifetimes renew at half-life instead.
      renewAt: now + (ttlMs > RENEW_EARLY_MS * 2 ? ttlMs - RENEW_EARLY_MS : ttlMs / 2),
      tokens: new Map(),
    };
  }

  private async homepage(ua: string): Promise<BgChallenge> {
    const res = await fetchWithTimeout(
      this.f,
      HOME,
      {
        headers: {
          "User-Agent": ua,
          "Accept-Language": "en-US,en;q=0.7",
          // Skips the EU consent interstitial, which carries no challenge.
          Cookie: "SOCS=CAE=",
        },
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) throw new PoTokenError(`homepage HTTP ${res.status}`);
    const ch = parseHomepage(await res.text());
    if (!ch) throw new PoTokenError("homepage has no ytAtN challenge");
    return ch;
  }

  private async create(ua: string): Promise<BgChallenge> {
    const ch = parseCreate(await this.post(`${JNN}/Create`, [REQUEST_KEY], ua));
    if (!ch) throw new PoTokenError("Create gave no challenge");
    return ch;
  }

  private async fetchVisitorData(ua: string): Promise<string | undefined> {
    try {
      const res = await fetchWithTimeout(
        this.f,
        VISITOR_URL,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": ua },
          body: JSON.stringify({
            context: {
              client: { clientName: "WEB", clientVersion: WEB_CLIENT_VERSION, hl: "en" },
            },
          }),
        },
        FETCH_TIMEOUT_MS,
      );
      const j = (await res.json()) as { responseContext?: { visitorData?: unknown } };
      return str(j.responseContext?.visitorData);
    } catch (e) {
      this.log(`visitor_id failed: ${msg(e)}`);
      return undefined;
    }
  }

  private async post(url: string, body: unknown, ua: string): Promise<unknown> {
    const res = await fetchWithTimeout(
      this.f,
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json+protobuf",
          Accept: "application/json",
          "User-Agent": ua,
          "x-goog-api-key": GOOGLE_API_KEY,
          "x-user-agent": "grpc-web-javascript/0.1",
        },
        body: JSON.stringify(body),
      },
      FETCH_TIMEOUT_MS,
    );
    if (!res.ok) throw new PoTokenError(`${url.split("/").pop()} HTTP ${res.status}`);
    return res.json();
  }
}

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
