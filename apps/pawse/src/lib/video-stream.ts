import {
  fetchSegmentIndex,
  hlsMaster,
  hlsMediaPlaylist,
} from "@pawse/innertube";
import type { StreamPart, VideoStream } from "@pawse/music-core";
import { Directory, File, Paths } from "expo-file-system";

import { ytv } from "../data/clients";
import { appFetch } from "./net";

/** A ready-to-play video: an HLS master over small byte ranges of YouTube's separate video and audio files. */
export interface VideoSource {
  uri: string;
  stream: VideoStream;
}

async function mediaPlaylist(part: StreamPart, st: VideoStream) {
  const index = await fetchSegmentIndex(appFetch, part.url, st.headers);
  if (!index) throw new Error("this video has no segment index");
  return hlsMediaPlaylist(part.url, index);
}

/** Resolves the video and writes its playlists to the cache folder; the player reads the master file. */
export async function videoSource(
  id: string,
  maxHeight: number,
): Promise<VideoSource> {
  const stream = await ytv.resolveStream(id, { maxHeight });
  const [video, audio] = await Promise.all([
    mediaPlaylist(stream.video, stream),
    mediaPlaylist(stream.audio, stream),
  ]);
  const dir = new Directory(Paths.cache, "hls", `v_${id.replace(/\W/g, "_")}`);
  if (!dir.exists) dir.create({ intermediates: true });
  const write = (name: string, text: string) => {
    const f = new File(dir, name);
    f.write(text);
    return f.uri;
  };
  const master = hlsMaster(
    { ...stream.video, uri: write("video.m3u8", video) },
    { ...stream.audio, uri: write("audio.m3u8", audio) },
  );
  return { uri: write("master.m3u8", master), stream };
}
