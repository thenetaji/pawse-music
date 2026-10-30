import type { VideoItem } from "@pawse/music-core";

const GONE = /^\[(private|deleted|unavailable)[^\]]*\]$/i;
const NOT_YET = /^(premieres?|scheduled|upcoming|waiting)\b/i;

/** Whether a feed item can play, judged from what it already says; members-only and Shorts go in the parser. */
export function playable(v: VideoItem): boolean {
  if (GONE.test(v.title.trim())) return false;
  if (v.live) return true;
  if (NOT_YET.test(v.publishedText ?? "") || NOT_YET.test(v.viewsText ?? ""))
    return false;
  return !!v.durationSec && v.durationSec > 0;
}
