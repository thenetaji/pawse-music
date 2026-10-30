import type { Track } from "@pawse/music-core";
import {
  POS_KEY,
  QUEUE_KEY,
  refreshUpcoming,
  setupPlayer,
} from "@pawse/player";
import { Platform } from "react-native";

import { startAccountSync } from "../data/account";
import { resolver, yt } from "../data/clients";
import "../data/downloads";
import "../data/signals";
import { useLibrary } from "../data/library";
import { kv } from "../data/storage";
import { readyArtwork, startArtwork } from "./artwork";
import { startAudioFx, trimSilence } from "./audio-fx";
import { showToast } from "../components/toast";
import { skipNote, songSkips } from "./community";
import { logEvent } from "./diagnostics";
import { withPlaylist } from "./long-stream";
import { COVER_PX, COVER_SAVER_PX } from "./cover";
import { relayStream } from "./net";
import { prepareOpus } from "./opus-remux";
import { isLowData, noteThroughput } from "./quality";
import { autoplayMode } from "./settings";
import { probeStream } from "./stream-probe";
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

// A different audio format, or Opus on iPhone turned on or off, changes the streams of the songs still to come.
useLibrary.subscribe((st, prev) => {
  if (
    st.settings.audioFormat !== prev.settings.audioFormat ||
    st.settings.opusIphone !== prev.settings.opusIphone
  )
    refreshUpcoming();
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
    gapless: () => settings().gapless ?? true,
    trimSilence,
    artwork: readyArtwork,
    artworkPx: () => (isLowData() ? COVER_SAVER_PX : COVER_PX),
    streamUrl: relayStream,
    upgrade: Platform.OS === "ios" ? prepareOpus : undefined,
    skipSegments: songSkips,
    onSkip: (_t, category) => showToast(skipNote(category)),
    onDiagnostic: logEvent,
    probe: probeStream,
    // Automatic quality follows measured speed, not stalls: a stall with no data says nothing about bandwidth.
    onThroughput: noteThroughput,
    onLoadIssue: (issue) => {
      if (issue.kind === "weak")
        return showToast("Weak connection, still loading…", { ms: 3000 });
      showToast(
        issue.reason === "slow"
          ? `Couldn't load ${issue.track.title} — connection too slow`
          : `Couldn't load ${issue.track.title} — YouTube didn't send this song`,
        { bad: true },
      );
    },
    onPlayed: (track: Track, playedSec: number) => {
      const lib = useLibrary.getState();
      if (lib.settings.pauseHistory || lib.settings.incognito) return;
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
  startAudioFx();
  startArtwork();
  startAccountSync();
  return started;
}
