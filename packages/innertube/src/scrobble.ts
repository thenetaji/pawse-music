import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";

const LASTFM = "https://ws.audioscrobbler.com/2.0/";
const LISTENBRAINZ = "https://api.listenbrainz.org/1";
const TIMEOUT_MS = 10_000;

export interface Listen {
  artist: string;
  title: string;
  album?: string;
  durationSec?: number;
  startedAt?: number;
}

export type ScrobbleResult = "ok" | "retry" | "rejected" | "signed-out";

/** Last.fm's rule: half the song or four minutes, for songs over 30 seconds. */
export function scrobbleAfterSec(durationSec: number): number | undefined {
  return durationSec >= 30 ? Math.min(durationSec / 2, 240) : undefined;
}

export interface LastFmOptions {
  fetch?: FetchLike;
  apiKey: string;
  secret: string;
  md5: (text: string) => Promise<string>;
  sessionKey?: string;
}

type LastFmReply = { error?: number; message?: string } & Record<string, any>;

export class LastFm {
  private readonly f: FetchLike;
  constructor(private readonly o: LastFmOptions) {
    this.f = o.fetch ?? defaultFetch;
  }

  /** Sorted name+value pairs plus the secret, in MD5; `format` is left out. */
  async sign(params: Record<string, string>): Promise<string> {
    const text = Object.keys(params)
      .filter((k) => k !== "format" && k !== "callback")
      .sort()
      .map((k) => k + params[k])
      .join("");
    return this.o.md5(text + this.o.secret);
  }

  private async call(
    params: Record<string, string>,
    sign = true,
  ): Promise<LastFmReply> {
    const all: Record<string, string> = { ...params, api_key: this.o.apiKey };
    if (sign) all.api_sig = await this.sign(all);
    all.format = "json";
    const res = await fetchWithTimeout(
      this.f,
      LASTFM,
      {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: Object.entries(all)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join("&"),
      },
      TIMEOUT_MS,
    );
    let body: LastFmReply = {};
    try {
      body = (await res.json()) as LastFmReply;
    } catch {
      if (!res.ok) return { error: 16, message: `HTTP ${res.status}` };
    }
    return body;
  }

  async getToken(): Promise<string> {
    const r = await this.call({ method: "auth.getToken" });
    if (!r.token) throw new Error(r.message ?? "Last.fm gave no token");
    return r.token;
  }

  authUrl(token: string): string {
    return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(this.o.apiKey)}&token=${encodeURIComponent(token)}`;
  }

  async getSession(token: string): Promise<{ key: string; name: string }> {
    const r = await this.call({ method: "auth.getSession", token });
    if (!r.session?.key) throw new Error(r.message ?? "Not approved yet");
    return { key: r.session.key, name: r.session.name };
  }

  private static result(r: LastFmReply): ScrobbleResult {
    if (!r.error) return "ok";
    // 9: the session key is no good any more; 4, 10, 14, 26: the key or the sign-in was refused.
    if ([4, 9, 10, 14, 26].includes(r.error)) return "signed-out";
    // 11, 16: Last.fm is struggling; 29: too many requests.
    if ([8, 11, 16, 29].includes(r.error)) return "retry";
    return "rejected";
  }

  private songParams(l: Listen, suffix = ""): Record<string, string> {
    return {
      [`artist${suffix}`]: l.artist,
      [`track${suffix}`]: l.title,
      ...(l.album ? { [`album${suffix}`]: l.album } : {}),
      ...(l.durationSec
        ? { [`duration${suffix}`]: String(Math.round(l.durationSec)) }
        : {}),
    };
  }

  async nowPlaying(l: Listen): Promise<ScrobbleResult> {
    try {
      return LastFm.result(
        await this.call({
          method: "track.updateNowPlaying",
          sk: this.o.sessionKey ?? "",
          ...this.songParams(l),
        }),
      );
    } catch {
      return "retry";
    }
  }

  /** Last.fm takes up to 50 at a time. */
  async scrobble(listens: Listen[]): Promise<ScrobbleResult> {
    const params: Record<string, string> = {
      method: "track.scrobble",
      sk: this.o.sessionKey ?? "",
    };
    listens.slice(0, 50).forEach((l, i) => {
      Object.assign(params, this.songParams(l, `[${i}]`), {
        [`timestamp[${i}]`]: String(
          l.startedAt ?? Math.floor(Date.now() / 1000),
        ),
      });
    });
    try {
      return LastFm.result(await this.call(params));
    } catch {
      return "retry";
    }
  }
}

export interface ListenBrainzOptions {
  fetch?: FetchLike;
  token: string;
  client: { name: string; version: string };
}

export class ListenBrainz {
  private readonly f: FetchLike;
  constructor(private readonly o: ListenBrainzOptions) {
    this.f = o.fetch ?? defaultFetch;
  }

  private headers() {
    return {
      Authorization: `Token ${this.o.token.trim()}`,
      "Content-Type": "application/json",
    };
  }

  async validate(): Promise<string | undefined> {
    const res = await fetchWithTimeout(
      this.f,
      `${LISTENBRAINZ}/validate-token`,
      { credentials: "omit", headers: this.headers() },
      TIMEOUT_MS,
    );
    const body = (await res.json().catch(() => ({}))) as {
      valid?: boolean;
      user_name?: string;
    };
    return body.valid ? body.user_name : undefined;
  }

  private meta(l: Listen) {
    return {
      artist_name: l.artist,
      track_name: l.title,
      ...(l.album ? { release_name: l.album } : {}),
      additional_info: {
        media_player: this.o.client.name,
        submission_client: this.o.client.name,
        submission_client_version: this.o.client.version,
        music_service: "youtube.com",
        ...(l.durationSec
          ? { duration_ms: Math.round(l.durationSec * 1000) }
          : {}),
      },
    };
  }

  private async submit(
    type: "playing_now" | "single" | "import",
    listens: Listen[],
  ): Promise<ScrobbleResult> {
    try {
      const res = await fetchWithTimeout(
        this.f,
        `${LISTENBRAINZ}/submit-listens`,
        {
          method: "POST",
          credentials: "omit",
          headers: this.headers(),
          body: JSON.stringify({
            listen_type: type,
            payload: listens.map((l) => ({
              ...(type === "playing_now"
                ? {}
                : {
                    listened_at: l.startedAt ?? Math.floor(Date.now() / 1000),
                  }),
              track_metadata: this.meta(l),
            })),
          }),
        },
        TIMEOUT_MS,
      );
      if (res.ok) return "ok";
      if (res.status === 401) return "signed-out";
      if (res.status === 429 || res.status >= 500) return "retry";
      return "rejected";
    } catch {
      return "retry";
    }
  }

  nowPlaying(l: Listen) {
    return this.submit("playing_now", [l]);
  }

  scrobble(listens: Listen[]) {
    return this.submit(listens.length > 1 ? "import" : "single", listens);
  }
}
