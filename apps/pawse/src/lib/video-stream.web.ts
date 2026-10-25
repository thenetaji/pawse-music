import { relayStream } from "./net";
import {
  buildMutedVideo,
  buildVideoSource,
  type PlaylistHost,
  type Quality,
  type VideoSource,
} from "./video-ladder";

export type { Quality, QualityOption, VideoSource } from "./video-ladder";
export { forgetStream } from "./video-ladder";

// Playlists live in memory as blob URLs; their segments go through the relay like songs do.
let urls: string[] = [];

const host: PlaylistHost = {
  publish: async (_name, text) => {
    const u = URL.createObjectURL(
      new Blob([text], { type: "application/vnd.apple.mpegurl" }),
    );
    urls.push(u);
    return u;
  },
  media: (part, st) => relayStream!({ ...part, headers: st.headers } as never),
  forget: () => {
    for (const u of urls) URL.revokeObjectURL(u);
    urls = [];
  },
};

export const videoSource = (
  id: string,
  quality: Quality,
): Promise<VideoSource> => buildVideoSource(host, id, quality);

export const mutedVideo = (id: string, maxHeight: number): Promise<string> =>
  buildMutedVideo(host, id, maxHeight);
