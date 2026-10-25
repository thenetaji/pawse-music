import type { Thumbnail } from "./index";

// YouTube mode: the www.youtube.com catalog, with Shorts, ads and mixes already dropped.

export interface VideoItem {
  type: "video";
  id: string;
  title: string;
  channel?: { id?: string; name: string; avatar?: Thumbnail[] };
  durationSec?: number;
  viewsText?: string;
  publishedText?: string;
  thumbnails: Thumbnail[];
  live?: boolean;
}

export interface ChannelItem {
  type: "channel";
  id: string;
  name: string;
  avatar: Thumbnail[];
  subscribersText?: string;
}

export interface VideoFeed {
  items: VideoItem[];
  /** Opaque token for the next page. */
  continuation?: string;
}

export interface VideoSearchResults {
  items: (VideoItem | ChannelItem)[];
  continuation?: string;
}

export interface VideoDetail {
  video: VideoItem;
  description?: string;
  chapters: { title: string; startSec: number }[];
  related: VideoItem[];
}

export interface ChannelPage {
  channel: ChannelItem;
  banner?: Thumbnail[];
  videos: VideoItem[];
  continuation?: string;
}

export interface StreamPart {
  url: string;
  mimeType: string;
  bitrate: number;
  width?: number;
  height?: number;
  fps?: number;
  contentLength?: number;
  /** Byte range of the container header (fMP4 `moov`). */
  initRange?: { start: number; end: number };
  /** Byte range of the segment index (`sidx`). */
  indexRange?: { start: number; end: number };
}

/** Separate H.264 video and AAC audio streams from one client, for a player that merges them. */
export interface VideoStream {
  video: StreamPart;
  audio: StreamPart;
  durationSec?: number;
  /** Epoch ms. Re-resolve before this. */
  expiresAt: number;
  headers?: Record<string, string>;
  /** Which client produced it, for diagnostics. */
  via: string;
}
