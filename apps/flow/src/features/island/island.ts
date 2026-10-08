// Drives Flow's Live Activity (Dynamic Island + Lock Screen) from the player. iOS only; a no-op elsewhere.
import { artistLine, bestThumbnail, type Track } from "@studio/music-core";
import {
  getProgress,
  onPlayerEvent,
  player,
  usePlayerStore,
  type PlayerStatus,
} from "@studio/player";
import { AppState } from "react-native";

import {
  FlowActivity,
  type ActivityMood,
  type ActivityState,
} from "../../../modules/flow-activity";

/** Groove frame swap period. Each swap is one ActivityKit update, so stay well under 1/s. */
export const BEAT_MS = 2000;
/** Stop swapping after this long in the background; the cat rests on one frame. */
export const BACKGROUND_BEAT_BUDGET_MS = 10 * 60_000;
const HAPPY_MS = 1500;
const CURIOUS_MS = 1000;
const ART_PX = 120;

const isPlaying = (s: PlayerStatus) =>
  s === "playing" || s === "buffering" || s === "loading";

let stopController: (() => void) | null = null;

/** Call once from the app root. Returns a stop function (handy for fast refresh). */
export function startIslandController(): () => void {
  if (stopController) return stopController;
  if (!FlowActivity.available) return () => {};

  let active = false;
  let starting = false;
  let frame = 0;
  let flash: {
    mood: ActivityMood;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let beat: ReturnType<typeof setInterval> | undefined;
  let backgroundSince = AppState.currentState === "active" ? 0 : Date.now();
  let art: { id: string; file: string | null } = { id: "", file: null };
  let startMs = 0;
  let lastKey = "";
  let sending = false;
  let queued: ActivityState | null = null;

  const current = (): Track | undefined => {
    const s = usePlayerStore.getState();
    return s.tracks[s.index];
  };

  function compose(): ActivityState | null {
    const s = usePlayerStore.getState();
    const track = s.tracks[s.index];
    if (!track) return null;
    const playing = isPlaying(s.status);
    const { position, duration: d } = getProgress();
    const duration = d || track.durationSec || 0;
    const start = Date.now() - position * 1000;
    // Ignore small drift so steady playback doesn't produce a new state every tick.
    if (Math.abs(start - startMs) > 1500) startMs = start;
    return {
      title: track.title,
      artist: artistLine(track.artists),
      artwork: art.id === track.id ? art.file : null,
      isPlaying: playing,
      mood: flash?.mood ?? (playing ? "groove" : "sleep"),
      frame,
      start: Math.round(startMs),
      end: Math.round(startMs + duration * 1000),
      progress: duration ? Math.min(1, position / duration) : 0,
    };
  }

  // One native call in flight at a time; only the newest pending state is kept.
  function send(state: ActivityState) {
    if (sending) {
      queued = state;
      return;
    }
    sending = true;
    void FlowActivity.update(state).finally(() => {
      sending = false;
      const next = queued;
      queued = null;
      if (next && active) send(next);
    });
  }

  function push() {
    if (!active) return;
    const state = compose();
    if (!state) return;
    const key = JSON.stringify(state);
    if (key === lastKey) return;
    lastKey = key;
    send(state);
  }

  async function begin() {
    if (starting || active) return;
    const state = compose();
    if (!state || !FlowActivity.isSupported()) return;
    starting = true;
    // iOS refuses to start an activity from the background; we retry when the app is active again.
    const ok = await FlowActivity.start(state);
    starting = false;
    if (!ok || !isPlaying(usePlayerStore.getState().status)) {
      if (ok) void FlowActivity.end();
      return;
    }
    active = true;
    lastKey = JSON.stringify(state);
    push();
    syncBeat();
  }

  function finish() {
    active = false;
    lastKey = "";
    queued = null;
    syncBeat();
    void FlowActivity.end();
  }

  function loadArt(track: Track) {
    art = { id: track.id, file: null };
    const url = bestThumbnail(track.thumbnails, ART_PX);
    if (!url) return;
    void FlowActivity.setArtwork(url).then((file) => {
      if (!file || art.id !== track.id) return;
      art = { id: track.id, file };
      push();
    });
  }

  function syncBeat() {
    const want =
      active &&
      isPlaying(usePlayerStore.getState().status) &&
      backgroundSince > 0 &&
      Date.now() - backgroundSince < BACKGROUND_BEAT_BUDGET_MS;
    if (want && !beat) {
      beat = setInterval(() => {
        if (Date.now() - backgroundSince >= BACKGROUND_BEAT_BUDGET_MS)
          frame = 0;
        else frame ^= 1;
        push();
        syncBeat();
      }, BEAT_MS);
    } else if (!want && beat) {
      clearInterval(beat);
      beat = undefined;
    }
  }

  function setFlash(mood: ActivityMood, ms: number) {
    if (!active) return;
    if (flash) clearTimeout(flash.timer);
    flash = {
      mood,
      timer: setTimeout(() => {
        flash = null;
        push();
      }, ms),
    };
    push();
  }

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

  function onChange() {
    const s = usePlayerStore.getState();
    const track = current();
    if (!track || s.status === "idle" || queueEnded()) {
      if (active || starting) finish();
      return;
    }
    if (track.id !== art.id) loadArt(track);
    if (!active) {
      if (s.status === "playing") void begin();
    } else {
      push();
    }
    syncBeat();
  }

  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    if (
      s.status !== prev.status ||
      s.index !== prev.index ||
      s.tracks[s.index]?.id !== prev.tracks[prev.index]?.id
    ) {
      onChange();
    }
  });
  const unsubLiked = onPlayerEvent("liked", () => setFlash("happy", HAPPY_MS));
  const unsubSkipped = onPlayerEvent("skipped", () =>
    setFlash("curious", CURIOUS_MS),
  );
  const unsubAction = FlowActivity.onAction((action) =>
    action === "next" ? player.next() : player.toggle(),
  );
  const appState = AppState.addEventListener("change", (st) => {
    if (st === "active") {
      backgroundSince = 0;
      frame = 0;
      onChange();
    } else if (!backgroundSince) {
      backgroundSince = Date.now();
    }
    syncBeat();
  });

  // A previous process may have left an activity behind; start clean.
  if (!isPlaying(usePlayerStore.getState().status)) void FlowActivity.end();
  onChange();

  stopController = () => {
    unsubStore();
    unsubLiked();
    unsubSkipped();
    unsubAction();
    appState.remove();
    if (flash) clearTimeout(flash.timer);
    if (beat) clearInterval(beat);
    stopController = null;
  };
  return stopController;
}
