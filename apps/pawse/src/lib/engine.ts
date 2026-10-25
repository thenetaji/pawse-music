import type { Track } from "@pawse/music-core";
import { POS_KEY, QUEUE_KEY, setupPlayer } from "@pawse/player";

import { startAccountSync } from "../data/account";
import { resolver, yt } from "../data/clients";
import "../data/downloads";
import "../data/signals";
import { useLibrary } from "../data/library";
import { kv } from "../data/storage";
import { readyArtwork, startArtwork } from "./artwork";
import { showToast } from "../components/toast";
import { skipNote, songSkips } from "./community";
import { logEvent } from "./diagnostics";
import { withPlaylist } from "./long-stream";
import { relayStream } from "./net";
import { noteStall } from "./quality";
import { autoplayMode } from "./settings";
import { clearResources } from "./use-resource";

export { lyricsService, saavn, yt, ytv } from "../data/clients";

const settings = () => useLibrary.getState().settings;

// "Resume where you left off" off: the queue is still saved, but never restored.
const playerStorage = {
  get: (k: string) =>
    !settings().resume && (k === QUEUE_KEY || k === POS_KEY)
      ? Promise.resolve(null)
      : kv.get(k),
  set: (k: string, v: string) => kv.set(k, v),
};

// Signing in or out changes every catalog answer, so cached pages are dropped.
let lastCookies = useLibrary.getState().settings.cookies;
useLibrary.subscribe((st) => {
  if (st.settings.cookies === lastCookies) return;
  lastCookies = st.settings.cookies;
  clearResources();
});

let started: Promise<void> | null = null;
export function startEngine() {
  started ??= setupPlayer({
    resolver: {
      resolve: (t, o) =>
        resolver.resolve(t, o).then((st) => withPlaylist(t.id, st)),
    },
    catalog: yt,
    storage: playerStorage,
    pauseOnDisconnect: settings().pauseOnDisconnect,
    radioContinue: () => autoplayMode() !== "off",
    // Radio and autoplay never add a disliked song.
    skipTrack: (t: Track) => useLibrary.getState().isDisliked(t.id),
    sleepFadeSec: () => settings().sleepFade,
    crossfadeSec: () => settings().crossfade ?? 0,
    artwork: readyArtwork,
    streamUrl: relayStream,
    skipSegments: songSkips,
    onSkip: (_t, category) => showToast(skipNote(category)),
    onDiagnostic: (kind, detail) => {
      logEvent(kind, detail);
      // Automatic quality steps down when streams keep stalling.
      if (kind === "error" && detail?.startsWith("stalled")) noteStall();
    },
    onPlayed: (track: Track, playedSec: number) => {
      const lib = useLibrary.getState();
      if (lib.settings.pauseHistory) return;
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
  startArtwork();
  startAccountSync();
  return started;
}
