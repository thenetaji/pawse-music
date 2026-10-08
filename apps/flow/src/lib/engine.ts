import {
  createResolver,
  JioSaavn,
  LyricsService,
  YouTubeMusic,
} from "@studio/innertube";
import type { StreamResolver, Track } from "@studio/music-core";
import { setupPlayer } from "@studio/player";

import { useLibrary } from "../data/library";
import { kv } from "../data/storage";
import { appFetch } from "./net";

// One YouTube Music client for the app: cookies only when signed in, and only for catalog/account calls.
export const yt = new YouTubeMusic({
  fetch: appFetch,
  cookies: () => useLibrary.getState().settings.cookies,
});
export const saavn = new JioSaavn({ fetch: appFetch });
export const lyricsService = new LyricsService({ fetch: appFetch });

const resolvers = {
  youtube: createResolver({ youtube: yt, saavn }),
  saavn: createResolver({ youtube: yt, saavn, preferSaavn: true }),
};
const resolver: StreamResolver = {
  resolve: (t) =>
    (useLibrary.getState().settings.preferSaavn
      ? resolvers.saavn
      : resolvers.youtube
    ).resolve(t),
};

let started: Promise<void> | null = null;
export function startEngine() {
  started ??= setupPlayer({
    resolver,
    catalog: yt,
    storage: kv,
    onPlayed: (track: Track, playedSec: number) => {
      const lib = useLibrary.getState();
      lib.recordPlay(track);
      if (
        lib.settings.cookies &&
        lib.settings.reportPlays &&
        track.source === "youtube"
      ) {
        yt.reportPlayback(
          track.id,
          playedSec,
          track.durationSec ?? playedSec,
        ).catch(() => {});
      }
    },
  });
  return started;
}
