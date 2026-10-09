// Drives Flow's Live Activity (Dynamic Island + Lock Screen) from the player. iOS only; a no-op elsewhere.
import { artistLine, bestThumbnail, type Track } from "@studio/music-core";
import {
  getProgress,
  onPlayerEvent,
  type PlayerStatus,
  player,
  usePlayerStore,
} from "@studio/player";
import { AppState } from "react-native";

import {
  type ActivityCatColor,
  type ActivityMood,
  type ActivityState,
  FlowActivity,
} from "../../../modules/flow-activity";
import { useLibrary } from "../../data/library";

/** Groove frame swap period. Each swap is one ActivityKit update, so stay well under 1/s. */
export const BEAT_MS = 2000;
/** Stop swapping after this long in the background; the cat rests on one frame. */
export const BACKGROUND_BEAT_BUDGET_MS = 10 * 60_000;
const HAPPY_MS = 1500;
const CURIOUS_MS = 1000;
const ART_PX = 120;
const CAT_COLORS: readonly ActivityCatColor[] = [
  "orange",
  "black",
  "white",
  "grey",
];
/** Chance that a song gets the mouse cameo, by the catEpisodes setting. */
const CAMEO_CHANCE = { rare: 0.4, often: 0.8 };
/** Mouse frame per beat tick: peek, head out, peek, head out, peek; the cat is pleased after. */
const CAMEO_FRAMES: readonly (1 | 2)[] = [1, 2, 1, 2, 1];

type CatPrefs = {
  island: boolean;
  color: ActivityCatColor;
  cameoChance: number;
  name: string | null;
};

// The cat fields are new to Settings; read them loosely with defaults so older saved state works.
export function catPrefs(): CatPrefs {
  const s = (useLibrary.getState().settings ?? {}) as Record<string, unknown>;
  const episodes = s.catEpisodes;
  const name = typeof s.catName === "string" ? s.catName.trim() : "";
  return {
    island: s.catIsland !== false,
    color: CAT_COLORS.find((c) => c === s.catColor) ?? "orange",
    cameoChance:
      episodes === "off" || episodes === false
        ? 0
        : episodes === "often"
          ? CAMEO_CHANCE.often
          : CAMEO_CHANCE.rare,
    name: name ? name.slice(0, 32) : null,
  };
}

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
  // The first song of a session always gets the mouse, so the episode is actually seen.
  let firstCameo = true;
  // At most one cameo per song. step: -1 waiting, 0..n-1 showing, CAMEO_FRAMES.length done.
  let cameo: { trackId: string; atSec: number; step: number } = {
    trackId: "",
    atSec: 0,
    step: CAMEO_FRAMES.length,
  };

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
    const prefs = catPrefs();
    const showing =
      cameo.trackId === track.id &&
      cameo.step >= 0 &&
      cameo.step < CAMEO_FRAMES.length;
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
      color: prefs.color,
      mouse: showing ? (CAMEO_FRAMES[cameo.step] ?? 0) : 0,
      name: prefs.name,
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
    // Island cat off: no activity at all, so the system's Now Playing island shows instead.
    if (!state || !catPrefs().island || !FlowActivity.isSupported()) return;
    starting = true;
    // iOS refuses to start an activity from the background; we retry when the app is active again.
    const ok = await FlowActivity.start(state);
    starting = false;
    if (
      !ok ||
      !isPlaying(usePlayerStore.getState().status) ||
      !catPrefs().island
    ) {
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

  function planCameo(track: Track) {
    const chance = catPrefs().cameoChance;
    const duration = track.durationSec || 0;
    // Somewhere in the first 80 s, never in the last 20 s.
    const atSec = 15 + Math.random() * 65;
    const lucky =
      chance > 0 &&
      (firstCameo || Math.random() < chance) &&
      (!duration || atSec < duration - 20);
    if (lucky) firstCameo = false;
    cameo = {
      trackId: track.id,
      atSec,
      step: lucky ? -1 : CAMEO_FRAMES.length,
    };
  }

  // Runs on a beat tick and takes that tick's update instead of the groove swap, so it costs nothing extra.
  function stepCameo(spentMs: number): boolean {
    if (cameo.trackId !== current()?.id || cameo.step >= CAMEO_FRAMES.length)
      return false;
    if (cameo.step >= 0) {
      cameo.step += 1;
      if (cameo.step === CAMEO_FRAMES.length) setFlash("happy", HAPPY_MS);
      return true;
    }
    if (flash || catPrefs().cameoChance === 0) return false;
    if (getProgress().position < cameo.atSec) return false;
    const needMs = (CAMEO_FRAMES.length + 1) * BEAT_MS;
    if (spentMs + needMs > BACKGROUND_BEAT_BUDGET_MS) return false;
    cameo.step = 0;
    return true;
  }

  function syncBeat() {
    const want =
      active &&
      isPlaying(usePlayerStore.getState().status) &&
      backgroundSince > 0 &&
      Date.now() - backgroundSince < BACKGROUND_BEAT_BUDGET_MS;
    if (want && !beat) {
      beat = setInterval(() => {
        const spent = Date.now() - backgroundSince;
        if (spent >= BACKGROUND_BEAT_BUDGET_MS) frame = 0;
        else if (!stepCameo(spent)) frame ^= 1;
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
    if (track.id !== cameo.trackId) planCameo(track);
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
  const unsubSettings = useLibrary.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    if (!catPrefs().island) {
      if (active || starting) finish();
      return;
    }
    // Starts the activity if the cat was just switched on, or pushes the new colour/name.
    onChange();
  });
  const appState = AppState.addEventListener("change", (st) => {
    if (st === "active") {
      backgroundSince = 0;
      frame = 0;
      // The cameo is a background treat; a half-shown one counts as this song's.
      if (cameo.step >= 0) cameo.step = CAMEO_FRAMES.length;
      onChange();
    } else if (!backgroundSince) {
      backgroundSince = Date.now();
    }
    syncBeat();
  });

  // A previous process may have left an activity behind; start clean.
  if (!isPlaying(usePlayerStore.getState().status) || !catPrefs().island)
    void FlowActivity.end();
  onChange();

  stopController = () => {
    unsubStore();
    unsubLiked();
    unsubSkipped();
    unsubAction();
    unsubSettings();
    appState.remove();
    if (flash) clearTimeout(flash.timer);
    if (beat) clearInterval(beat);
    stopController = null;
  };
  return stopController;
}
