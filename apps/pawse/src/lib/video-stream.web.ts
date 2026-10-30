import { relayStream } from "./net";
import { higherQualities } from "./video-codecs";
import {
  buildMutedVideo,
  buildVideoSource,
  type PlaylistHost,
  prepareStream as prepare,
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

/** Gets the next video's stream ready while this one plays. */
export const prepareStream = (id: string) => prepare(id, higherQualities());

export const videoSource = (
  id: string,
  quality: Quality,
): Promise<VideoSource> =>
  buildVideoSource(host, id, quality, undefined, higherQualities());

export const mutedVideo = (id: string, maxHeight: number): Promise<string> =>
  buildMutedVideo(host, id, maxHeight);
