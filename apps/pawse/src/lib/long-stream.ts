import {
  fetchSegmentIndex,
  hlsMediaPlaylist,
  smallSegments,
  THROTTLE_BYTES,
} from "@pawse/innertube";
import type { ResolvedStream } from "@pawse/music-core";
import { Directory, File, Paths } from "expo-file-system";

import { logEvent } from "./diagnostics";
import { appFetch } from "./net";

let dir: Directory | undefined;
function playlistDir(): Directory {
  if (!dir) {
    dir = new Directory(Paths.cache, "hls");
    if (!dir.exists) dir.create({ intermediates: true });
  }
  return dir;
}

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
    const file = new File(playlistDir(), `${id.replace(/\W/g, "_")}.m3u8`);
    file.write(hlsMediaPlaylist(st.url, index));
    return { ...st, playlist: file.uri };
  } catch (e) {
    logEvent("playlist-failed", `${id}: ${(e as Error)?.message ?? e}`);
    return st;
  }
}
