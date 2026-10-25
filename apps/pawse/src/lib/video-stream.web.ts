import {
  fetchSegmentIndex,
  hlsMaster,
  hlsMediaPlaylist,
} from "@pawse/innertube";
import type { StreamPart, VideoStream } from "@pawse/music-core";

import { ytv } from "../data/clients";
import { appFetch, relayStream } from "./net";

export interface VideoSource {
  uri: string;
  stream: VideoStream;
}

// Playlists live in memory as blob URLs; their segments go through the relay like songs do.
let urls: string[] = [];
const blob = (text: string) => {
  const u = URL.createObjectURL(
    new Blob([text], { type: "application/vnd.apple.mpegurl" }),
  );
  urls.push(u);
  return u;
};

async function mediaPlaylist(part: StreamPart, st: VideoStream) {
  const index = await fetchSegmentIndex(appFetch, part.url, st.headers);
  if (!index) throw new Error("this video has no segment index");
  const relayed = relayStream!({ ...part, headers: st.headers } as never);
  return hlsMediaPlaylist(relayed, index);
}

export async function videoSource(
  id: string,
  maxHeight: number,
): Promise<VideoSource> {
  for (const u of urls) URL.revokeObjectURL(u);
  urls = [];
  const stream = await ytv.resolveStream(id, { maxHeight });
  const [video, audio] = await Promise.all([
    mediaPlaylist(stream.video, stream),
    mediaPlaylist(stream.audio, stream),
  ]);
  const master = hlsMaster(
    { ...stream.video, uri: blob(video) },
    { ...stream.audio, uri: blob(audio) },
  );
  return { uri: blob(master), stream };
}
