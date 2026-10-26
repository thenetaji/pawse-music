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
  /** YouTube files it as music (it would open as a radio): a song, music video or mix. */
  music?: boolean;
  /** YouTube's own "Not interested" and "Don't recommend channel" (signed in only). */
  feedback?: { notInterested?: string; channel?: string };
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

/** A YouTube playlist (or course) of videos. */
export interface VideoPlaylistItem {
  type: "playlist";
  id: string;
  title: string;
  author?: string;
  /** "80 videos" */
  countText?: string;
  thumbnails: Thumbnail[];
}

export interface VideoSearchResults {
  items: (VideoItem | ChannelItem | VideoPlaylistItem)[];
  continuation?: string;
}

export interface VideoDetail {
  video: VideoItem;
  description?: string;
  chapters: { title: string; startSec: number }[];
  related: VideoItem[];
  /** "1.25M subscribers". */
  subscribersText?: string;
  /** Signed in: whether you're subscribed to the channel. */
  subscribed?: boolean;
  /** Signed in: your rating of the video. */
  rating?: "like" | "dislike" | "none";
  /** Exact like count, when YouTube shows it. */
  likes?: number;
  /** Token for the first page of comments; absent when comments are off. */
  comments?: string;
}

export interface VideoComment {
  id: string;
  text: string;
  author: { id?: string; name: string; avatar?: string; creator?: boolean };
  published?: string;
  likes?: string;
  /** "13" when it has replies. */
  replies?: string;
  /** Token for its replies. */
  repliesToken?: string;
  pinned?: boolean;
  /** The creator hearted it. */
  hearted?: boolean;
  /** A reply rather than a top-level comment. */
  reply?: boolean;
}

export interface CommentPage {
  /** "5,207" — only on the first page. */
  count?: string;
  items: VideoComment[];
  continuation?: string;
}

export interface ChannelPage {
  channel: ChannelItem;
  banner?: Thumbnail[];
  videos: VideoItem[];
  continuation?: string;
  /** Signed in: whether the account is subscribed. */
  subscribed?: boolean;
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
  /** The tallest picture; `variants` holds it too. */
  video: StreamPart;
  /** Every H.264 quality from the same client, tallest first (one per height and frame rate). */
  variants: StreamPart[];
  audio: StreamPart;
  durationSec?: number;
  /** Epoch ms. Re-resolve before this. */
  expiresAt: number;
  headers?: Record<string, string>;
  /** Which client produced it, for diagnostics. */
  via: string;
  /** Other languages of the audio (dubs), when the video has them; the original first. */
  audioTracks?: AudioTrackOption[];
  /** The audio track playing. */
  audioTrack?: string;
  /** Subtitles YouTube has for the video. */
  captions?: CaptionTrack[];
}

export interface AudioTrackOption {
  id: string;
  name: string;
  original?: boolean;
}

export interface CaptionTrack {
  url: string;
  /** "en", "hi". */
  lang: string;
  name: string;
  /** Made by speech recognition rather than by the uploader. */
  auto?: boolean;
}

/** One line of subtitles, in seconds. */
export interface CaptionCue {
  start: number;
  end: number;
  text: string;
}
