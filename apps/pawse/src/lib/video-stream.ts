import {
  buildMutedVideo,
  buildVideoSource,
  type PlaylistHost,
  type Quality,
  type VideoSource,
} from "./video-ladder";
import { publishPlaylist } from "./playlists";

export type { Quality, QualityOption, VideoSource } from "./video-ladder";

const host: PlaylistHost = {
  publish: publishPlaylist,
  media: (part) => part.url,
};

export const videoSource = (
  id: string,
  quality: Quality,
): Promise<VideoSource> => buildVideoSource(host, id, quality);

export const mutedVideo = (id: string, maxHeight: number): Promise<string> =>
  buildMutedVideo(host, id, maxHeight);
