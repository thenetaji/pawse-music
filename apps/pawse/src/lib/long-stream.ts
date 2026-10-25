import {
  fetchSegmentIndex,
  hlsMediaPlaylist,
  smallSegments,
  THROTTLE_BYTES,
} from "@pawse/innertube";
import type { ResolvedStream } from "@pawse/music-core";

import { logEvent } from "./diagnostics";
import { appFetch } from "./net";
import { publishPlaylist } from "./playlists";

/** Long YouTube AAC streams get a local HLS playlist of small byte ranges; anything else, or a failure, plays as is. */
export async function withPlaylist(
  id: string,
  st: ResolvedStream,
): Promise<ResolvedStream> {
  if (
    !st.via.startsWith("youtube:") ||
    (st.contentLength ?? 0) <= THROTTLE_BYTES ||
    !/^audio\/mp4\b/i.test(st.mimeType)
  )
    return st;
  try {
    const index = await fetchSegmentIndex(appFetch, st.url, st.headers);
    if (!index || !smallSegments(index)) return st;
    const playlist = await publishPlaylist(
      `${id.replace(/\W/g, "_")}.m3u8`,
      hlsMediaPlaylist(st.url, index),
    );
    return { ...st, playlist };
  } catch (e) {
    logEvent("playlist-failed", `${id}: ${(e as Error)?.message ?? e}`);
    return st;
  }
}
