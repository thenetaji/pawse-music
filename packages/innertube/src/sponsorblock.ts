import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";

// SponsorBlock and DeArrow (sponsor.ajay.app) by Ajay Ramachandran; their data is CC BY-NC-SA 4.0.
const API = "https://sponsor.ajay.app/api";
const THUMBS = "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";
const TIMEOUT_MS = 6000;

export interface SkipSegment {
  start: number;
  end: number;
  category: string;
}

export interface Branding {
  /** A community title, when one is trusted (locked or not voted down). */
  title?: string;
  /** A frame of the video picked by the community, instead of the uploader's thumbnail. */
  thumbnail?: string;
}

export interface SponsorBlockOptions {
  fetch?: FetchLike;
  /** Hex SHA-256; with it lookups go by a 4-character hash prefix, so the server never sees the video id. */
  sha256?: (text: string) => Promise<string>;
}

type Entry<T> = { videoID: string } & T;

export class SponsorBlock {
  private readonly f: FetchLike;
  constructor(private readonly o: SponsorBlockOptions = {}) {
    this.f = o.fetch ?? defaultFetch;
  }

  /** Looks up by hash prefix when it can; a 404 means nothing is known for the video. */
  private async get<T>(
    path: string,
    id: string,
    query: string,
  ): Promise<T | undefined> {
    const prefix = this.o.sha256
      ? (await this.o.sha256(id)).slice(0, 4)
      : undefined;
    const url = prefix
      ? `${API}/${path}/${prefix}${query ? `?${query}` : ""}`
      : `${API}/${path}?videoID=${encodeURIComponent(id)}${query ? `&${query}` : ""}`;
    const res = await fetchWithTimeout(
      this.f,
      url,
      { credentials: "omit" },
      TIMEOUT_MS,
    );
    if (res.status === 404) return undefined;
    if (!res.ok) throw new Error(`SponsorBlock HTTP ${res.status}`);
    const data = await res.json();
    if (!prefix) return data as T;
    // Segments come back as a list of videos, branding as an object keyed by video id.
    return Array.isArray(data)
      ? (data as Entry<T>[]).find((e) => e.videoID === id)
      : (data as Record<string, T>)[id];
  }

  /** Segments to skip in `id`, earliest first; categories as SponsorBlock names them. */
  async segments(id: string, categories: string[]): Promise<SkipSegment[]> {
    if (!categories.length) return [];
    const q = `categories=${encodeURIComponent(JSON.stringify(categories))}&actionType=skip`;
    const raw = await this.get<
      | { segments?: { segment: [number, number]; category: string }[] }
      | { segment: [number, number]; category: string }[]
    >("skipSegments", id, q);
    const list = Array.isArray(raw) ? raw : (raw?.segments ?? []);
    return list
      .map((s) => ({
        start: s.segment[0],
        end: s.segment[1],
        category: s.category,
      }))
      .filter((s) => s.end - s.start >= 1)
      .sort((a, b) => a.start - b.start);
  }

  /** DeArrow's title and thumbnail for `id`; empty when the community hasn't settled on any. */
  async branding(id: string): Promise<Branding> {
    type Raw = {
      titles?: {
        title: string;
        original: boolean;
        votes: number;
        locked: boolean;
      }[];
      thumbnails?: {
        timestamp?: number;
        original: boolean;
        votes: number;
        locked: boolean;
      }[];
    };
    const raw = await this.get<Raw>("branding", id, "");
    const trusted = <
      T extends { original: boolean; votes: number; locked: boolean },
    >(
      xs?: T[],
    ) => xs?.find((x) => x.locked || x.votes >= 0);
    const t = trusted(raw?.titles);
    const th = trusted(raw?.thumbnails);
    return {
      // A leading ">" tells DeArrow not to auto-format the title.
      title: t && !t.original ? t.title.replace(/^>\s*/, "") : undefined,
      thumbnail:
        th && !th.original && typeof th.timestamp === "number"
          ? `${THUMBS}?videoID=${encodeURIComponent(id)}&time=${th.timestamp}`
          : undefined,
    };
  }
}
