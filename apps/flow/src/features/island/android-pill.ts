// Drives the Android cat pill (camera cutout overlay) and the home-screen widget from the player. Android only.
import { artistLine, bestThumbnail, type Track } from "@studio/music-core";
import {
  getProgress,
  onPlayerEvent,
  type PlayerStatus,
  player,
  usePlayerStore,
} from "@studio/player";
import { AppState, Platform } from "react-native";

import {
  FlowIsland,
  type PillMood,
  type PillState,
} from "../../../modules/flow-island-android";
import { useLibrary } from "../../data/library";
import { onArtworkReady, readyArtwork } from "../../lib/artwork";
import { getSetting } from "../../lib/settings";

const HAPPY_MS = 1500;
const CURIOUS_MS = 1000;
const ART_PX = 226;

const isPlaying = (s: PlayerStatus) =>
  s === "playing" || s === "buffering" || s === "loading";

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

// androidPillOffset is a vertical nudge in dp; an {x, y} object is accepted too.
function pillPrefs() {
  const enabled = getSetting<unknown>("androidPill", false) === true;
  const off = getSetting<unknown>("androidPillOffset", 0);
  if (off && typeof off === "object") {
    const o = off as { x?: unknown; y?: unknown };
    return { enabled, offsetX: num(o.x), offsetY: num(o.y) };
  }
  return { enabled, offsetX: 0, offsetY: num(off) };
}

let stopController: (() => void) | null = null;

/** Call once from the app root. Returns a stop function (handy for fast refresh). */
export function startAndroidPill(): () => void {
  if (stopController) return stopController;
  if (Platform.OS !== "android" || !FlowIsland.available) return () => {};

  let shown = false;
  let lastKey = "";
  let last: PillState | null = null;
  let flash: {
    mood: PillMood;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  // Native calls run in order; each one carries the full state.
  let chain: Promise<void> = Promise.resolve();
  const call = (fn: () => Promise<void>) => {
    chain = chain.then(fn, fn);
  };

  // The last track ran out with nothing to refill: RNTP just pauses, so look at the position.
  function queueEnded(): boolean {
    const s = usePlayerStore.getState();
    if (
      s.status !== "paused" ||
      s.repeat !== "off" ||
      s.radio ||
      s.index < s.tracks.length - 1
    )
      return false;
    const { position, duration } = getProgress();
    return duration > 0 && position >= duration - 2;
  }

  function compose(track: Track, playing: boolean): PillState {
    const prefs = pillPrefs();
    return {
      trackId: track.id,
      title: track.title,
      artist: artistLine(track.artists),
      artworkUrl:
        readyArtwork(track) ?? bestThumbnail(track.thumbnails, ART_PX) ?? null,
      mood: flash?.mood ?? (playing ? "groove" : "sleep"),
      isPlaying: playing,
      offsetX: prefs.offsetX,
      offsetY: prefs.offsetY,
    };
  }

  function sync() {
    const s = usePlayerStore.getState();
    const track: Track | undefined = s.tracks[s.index];
    const live = !!track && s.status !== "idle" && !queueEnded();
    const state: PillState | null = track
      ? compose(track, live && isPlaying(s.status))
      : last && { ...last, isPlaying: false, mood: "sleep" };
    const want =
      live && pillPrefs().enabled && FlowIsland.hasOverlayPermission();

    if (!want && shown) {
      shown = false;
      call(() => FlowIsland.hide());
    }
    if (!state) return;
    last = state;
    const key = `${want}|${JSON.stringify(state)}`;
    if (key === lastKey) return;
    lastKey = key;
    if (want && !shown) {
      shown = true;
      call(() => FlowIsland.show(state));
    } else {
      // Also keeps the home-screen widget current when the pill is off.
      call(() => FlowIsland.update(state));
    }
  }

  function setFlash(mood: PillMood, ms: number) {
    if (flash) clearTimeout(flash.timer);
    flash = {
      mood,
      timer: setTimeout(() => {
        flash = null;
        sync();
      }, ms),
    };
    sync();
  }

  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    if (
      s.status !== prev.status ||
      s.index !== prev.index ||
      s.tracks[s.index]?.id !== prev.tracks[prev.index]?.id
    ) {
      sync();
    }
  });
  const unsubLibrary = useLibrary.subscribe((s, prev) => {
    if (s.settings !== prev.settings) sync();
  });
  const unsubLiked = onPlayerEvent("liked", () => setFlash("happy", HAPPY_MS));
  const unsubSkipped = onPlayerEvent("skipped", () =>
    setFlash("curious", CURIOUS_MS),
  );
  const unsubAction = FlowIsland.onAction((action) =>
    action === "next" ? player.next() : player.toggle(),
  );
  const unsubArt = onArtworkReady((id) => {
    const s = usePlayerStore.getState();
    if (s.tracks[s.index]?.id === id) sync();
  });
  // Back from Settings: the overlay permission may have just been granted.
  const appState = AppState.addEventListener("change", (st) => {
    if (st === "active") sync();
  });

  sync();

  stopController = () => {
    unsubStore();
    unsubLibrary();
    unsubLiked();
    unsubSkipped();
    unsubAction();
    unsubArt();
    appState.remove();
    if (flash) clearTimeout(flash.timer);
    stopController = null;
  };
  return stopController;
}
