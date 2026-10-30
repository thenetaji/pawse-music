import { type FetchLike, defaultFetch, fetchWithTimeout } from "./util/http";

// SponsorBlock and DeArrow forbid automated submissions: call these only for something the person did.
const API = "https://sponsor.ajay.app/api";
const TIMEOUT_MS = 10_000;

export const SEGMENT_CATEGORIES = [
  "sponsor",
  "selfpromo",
  "interaction",
  "intro",
  "outro",
  "music_offtopic",
  "poi_highlight",
] as const;
export type SegmentCategory = (typeof SEGMENT_CATEGORIES)[number];

export type Submitted = "ok" | "duplicate" | "slow-down" | "rejected";

export interface ContributeOptions {
  fetch?: FetchLike;
  /** Random, at least 30 characters. */
  userId: string;
  userAgent: string;
}

export class Contribute {
  private readonly f: FetchLike;
  constructor(private readonly o: ContributeOptions) {
    this.f = o.fetch ?? defaultFetch;
  }

  private async send(url: string, body?: unknown): Promise<Submitted> {
    const res = await fetchWithTimeout(
      this.f,
      url,
      {
        method: "POST",
        credentials: "omit",
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      },
      TIMEOUT_MS,
    );
    if (res.ok) return "ok";
    if (res.status === 409) return "duplicate";
    if (res.status === 429) return "slow-down";
    if (res.status >= 500) throw new Error(`SponsorBlock HTTP ${res.status}`);
    return "rejected";
  }

  /** "Best part" is one moment, so it ends where it starts. */
  submitSegment(s: {
    videoId: string;
    start: number;
    end: number;
    category: SegmentCategory;
    duration?: number;
  }): Promise<Submitted> {
    const poi = s.category === "poi_highlight";
    const start = Math.round(s.start * 1000) / 1000;
    const end = poi ? start : Math.round(s.end * 1000) / 1000;
    return this.send(`${API}/skipSegments`, {
      videoID: s.videoId,
      userID: this.o.userId,
      userAgent: this.o.userAgent,
      service: "YouTube",
      ...(s.duration ? { videoDuration: s.duration } : {}),
      segments: [
        {
          segment: [start, end],
          category: s.category,
          actionType: poi ? "poi" : "skip",
        },
      ],
    });
  }

  vote(
    segment: { uuid: string; videoId: string },
    type: "up" | "down" | "undo",
  ): Promise<Submitted> {
    const t = type === "up" ? 1 : type === "down" ? 0 : 20;
    return this.send(
      `${API}/voteOnSponsorTime?UUID=${encodeURIComponent(segment.uuid)}&videoID=${encodeURIComponent(segment.videoId)}&userID=${encodeURIComponent(this.o.userId)}&type=${t}`,
    );
  }

  private branding(
    videoId: string,
    part: { title?: { title: string }; thumbnail?: { timestamp: number } },
    downvote = false,
  ): Promise<Submitted> {
    return this.send(`${API}/branding`, {
      videoID: videoId,
      userID: this.o.userId,
      userAgent: this.o.userAgent,
      service: "YouTube",
      ...part,
      ...(downvote ? { downvote: true } : {}),
      autoLock: false,
    });
  }

  /** Sending a title DeArrow already has counts as a vote for it. */
  suggestTitle(videoId: string, title: string) {
    return this.branding(videoId, { title: { title: title.trim() } });
  }

  suggestThumbnail(videoId: string, timestamp: number) {
    return this.branding(videoId, {
      thumbnail: { timestamp: Math.round(timestamp * 1000) / 1000 },
    });
  }

  voteTitle(videoId: string, title: string, up: boolean) {
    return this.branding(videoId, { title: { title } }, !up);
  }

  voteThumbnail(videoId: string, timestamp: number, up: boolean) {
    return this.branding(videoId, { thumbnail: { timestamp } }, !up);
  }
}
