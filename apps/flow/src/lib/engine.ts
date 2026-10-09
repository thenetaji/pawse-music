import type { Track } from "@studio/music-core";
import { POS_KEY, QUEUE_KEY, setupPlayer } from "@studio/player";

import { startAccountSync } from "../data/account";
import { resolver, yt } from "../data/clients";
import "../data/downloads";
import "../data/signals";
import { useLibrary } from "../data/library";
import { kv } from "../data/storage";
import { logEvent } from "./diagnostics";
import { noteStall } from "./quality";
import { clearResources } from "./use-resource";

export { lyricsService, saavn, yt } from "../data/clients";

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
    resolver,
    catalog: yt,
    storage: playerStorage,
    pauseOnDisconnect: settings().pauseOnDisconnect,
    radioContinue: () => settings().radioContinue,
    sleepFadeSec: () => settings().sleepFade,
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
  startAccountSync();
  return started;
}
