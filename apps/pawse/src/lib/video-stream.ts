import { localVideo } from "../data/downloads";
import { publishPlaylist } from "./playlists";
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

const host: PlaylistHost = {
  publish: publishPlaylist,
  media: (part) => part.url,
};

/** Gets the next video's stream ready while this one plays. */
export const prepareStream = (id: string) => prepare(id, higherQualities());

export const videoSource = (
  id: string,
  quality: Quality,
  track?: string,
): Promise<VideoSource> =>
  buildVideoSource(host, id, quality, track, higherQualities());

/** A downloaded picture plays from the phone, so the Video side works offline. */
export const mutedVideo = (id: string, maxHeight: number): Promise<string> => {
  const local = localVideo(id);
  return local ? Promise.resolve(local) : buildMutedVideo(host, id, maxHeight);
};
