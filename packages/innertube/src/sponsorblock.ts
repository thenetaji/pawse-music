import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";

// SponsorBlock and DeArrow (sponsor.ajay.app) by Ajay Ramachandran; their data is CC BY-NC-SA 4.0.
const API = "https://sponsor.ajay.app/api";
const THUMBS = "https://dearrow-thumb.ajay.app/api/v1/getThumbnail";
const TIMEOUT_MS = 6000;

export interface SkipSegment {
  start: number;
  end: number;
  category: string;
  /** SponsorBlock's id for the segment, to vote on it. */
  uuid?: string;
  votes?: number;
  locked?: boolean;
}

const EDGE_SEC = 3;
const SURE_VOTES = 3;

/**
 * The non-music parts of a song worth jumping over. Intros and outros are safe to skip; a part in the middle is
 * often an instrumental break someone mislabelled, so it needs a locked segment or several upvotes.
 */
export function musicSkips(
  segments: SkipSegment[],
  durationSec?: number,
): SkipSegment[] {
  return segments.filter(
    (s) =>
      s.start <= EDGE_SEC ||
      (!!durationSec && s.end >= durationSec - EDGE_SEC) ||
      s.locked ||
      (s.votes ?? 0) >= SURE_VOTES,
  );
}

/** A chapter made by SponsorBlock's community, for videos without YouTube chapters. */
export interface CrowdChapter {
  startSec: number;
  title: string;
}

type RawSegment = {
  segment: [number, number];
  category: string;
  UUID?: string;
  votes?: number;
  locked?: number;
  description?: string;
};

export interface Branding {
  /** A community title, when one is trusted (locked or not voted down). */
  title?: string;
  /** A frame of the video picked by the community, instead of the uploader's thumbnail. */
  thumbnail?: string;
  /** The title as DeArrow keeps it, for voting on it. */
  rawTitle?: string;
  /** Second of the picked frame, for voting on it. */
  thumbnailTime?: number;
}

export interface SponsorBlockOptions {
  fetch?: FetchLike;
  /** Hex SHA-256; with it lookups go by a 4-character hash prefix, so the server never sees the video id. */
  sha256?: (text: string) => Promise<string>;
}

const trusted = (s: { locked?: number; votes?: number }) =>
  !!s.locked || (s.votes ?? 0) >= 0;

/** Community chapters as a plain list: best-voted first where they overlap, titled, earliest first. */
export function crowdChapters(list: RawSegment[]): CrowdChapter[] {
  const kept: RawSegment[] = [];
  const ranked = list
    .filter((s) => trusted(s) && s.description?.trim())
    .sort(
      (a, b) =>
        Number(!!b.locked) - Number(!!a.locked) ||
        (b.votes ?? 0) - (a.votes ?? 0),
    );
  for (const s of ranked)
    if (
      !kept.some(
        (k) => s.segment[0] < k.segment[1] && k.segment[0] < s.segment[1],
      )
    )
      kept.push(s);
  const out = kept
    .sort((a, b) => a.segment[0] - b.segment[0])
    .map((s) => ({ startSec: s.segment[0], title: s.description!.trim() }));
  return out.length >= 2 ? out : [];
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

  private async raw(
    id: string,
    category: string,
    actionType: string,
  ): Promise<RawSegment[]> {
    const q = `categories=${encodeURIComponent(JSON.stringify([category]))}&actionType=${actionType}`;
    const raw = await this.get<{ segments?: RawSegment[] } | RawSegment[]>(
      "skipSegments",
      id,
      q,
    );
    return Array.isArray(raw) ? raw : (raw?.segments ?? []);
  }

  /** Segments to skip in `id`, earliest first; categories as SponsorBlock names them. */
  async segments(id: string, categories: string[]): Promise<SkipSegment[]> {
    if (!categories.length) return [];
    const q = `categories=${encodeURIComponent(JSON.stringify(categories))}&actionType=skip`;
    const raw = await this.get<{ segments?: RawSegment[] } | RawSegment[]>(
      "skipSegments",
      id,
      q,
    );
    const list = Array.isArray(raw) ? raw : (raw?.segments ?? []);
    return list
      .filter(trusted)
      .map((s) => ({
        start: s.segment[0],
        end: s.segment[1],
        category: s.category,
        uuid: s.UUID,
        votes: s.votes,
        ...(s.locked ? { locked: true } : {}),
      }))
      .filter((s) => s.end - s.start >= 1)
      .sort((a, b) => a.start - b.start);
  }

  /** Where the community says the best part of `id` is ("Jump to the best part"), in seconds. */
  async highlight(
    id: string,
  ): Promise<{ at: number; uuid?: string } | undefined> {
    const list = await this.raw(id, "poi_highlight", "poi");
    const best = list
      .filter((s) => trusted(s) && Number.isFinite(s.segment[0]))
      .sort(
        (a, b) =>
          Number(!!b.locked) - Number(!!a.locked) ||
          (b.votes ?? 0) - (a.votes ?? 0),
      )[0];
    return best && { at: best.segment[0], uuid: best.UUID };
  }

  /** Chapters the community made for `id`, in order; fewer than two are too few to be useful. */
  async chapters(id: string): Promise<CrowdChapter[]> {
    return crowdChapters(await this.raw(id, "chapter", "chapter"));
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
      rawTitle: t && !t.original ? t.title : undefined,
      thumbnail:
        th && !th.original && typeof th.timestamp === "number"
          ? `${THUMBS}?videoID=${encodeURIComponent(id)}&time=${th.timestamp}`
          : undefined,
      thumbnailTime:
        th && !th.original && typeof th.timestamp === "number"
          ? th.timestamp
          : undefined,
    };
  }
}
