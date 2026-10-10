// Drives Pawse's Live Activity (Dynamic Island + Lock Screen) from the player. iOS only; a no-op elsewhere.
import { artistLine, bestThumbnail, type Track } from "@pawse/music-core";
import {
  getProgress,
  onPlayerEvent,
  type PlayerStatus,
  player,
  usePlayerStore,
} from "@pawse/player";
import { AppState } from "react-native";

import {
  type ActivityCatColor,
  type ActivityMood,
  type ActivityState,
  type IslandStyle,
  PawseActivity,
} from "../../../modules/pawse-activity";
import { useLibrary } from "../../data/library";
import { prepareArtwork } from "../../lib/artwork";
import { getSetting } from "../../lib/settings";
import { songVibe } from "../../lib/vibe";
import { readable, useNowPalette } from "../now-playing/now-palette";

/** Mouse visit frame period. The cat no longer dances frame by frame: every update costs battery, and iOS throttles them. */
export const BEAT_MS = 8000;
/** No mouse visits after this long in the background. */
export const BACKGROUND_BEAT_BUDGET_MS = 10 * 60_000;
const HAPPY_MS = 1500;
const SEND_TIMEOUT_MS = 4000;
/** While playing, re-check this often that the island's timeline still matches the song. */
const DRIFT_CHECK_MS = 15_000;
const SEEK_SETTLE_MS = 400;
/** After an island play/pause tap, states that contradict it are held back this long. */
const TOGGLE_HOLD_MS = 1200;
/** If Pawse is closed mid-song, iOS marks the activity stale this long after the song should end. */
const STALE_AFTER_END_MS = 90_000;
/** A paused activity goes stale after this, in case Pawse is closed while paused. */
const STALE_WHEN_PAUSED_MS = 15 * 60_000;

// Rounded to the minute so steady playback doesn't make every state look new.
export function staleAt(
  playing: boolean,
  endMs: number,
  now = Date.now(),
): number {
  const at =
    playing && endMs > now
      ? endMs + STALE_AFTER_END_MS
      : now + STALE_WHEN_PAUSED_MS;
  return Math.ceil(at / 60_000) * 60_000;
}
const CURIOUS_MS = 1000;
const ART_PX = 120;
const CAT_COLORS: readonly ActivityCatColor[] = [
  "orange",
  "black",
  "white",
  "grey",
];
/** Chance that a song gets the mouse cameo, by the catEpisodes setting. */
const CAMEO_CHANCE = { rare: 0.8, often: 1 };
/** Long songs get another visit this many seconds after the last one. */
const CAMEO_AGAIN_SEC: [number, number] = [60, 90];
/** Mouse frame per beat tick: peek, head out, peek; the cat is pleased after. */
const CAMEO_FRAMES: readonly (1 | 2)[] = [1, 2, 1];

// "music" (sound bars) is gone: iOS's own player beside the bubble already has them.
const ISLAND_STYLES: readonly IslandStyle[] = ["cat", "time"];

type CatPrefs = {
  island: boolean;
  style: IslandStyle;
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
    style: ISLAND_STYLES.find((v) => v === s.islandStyle) ?? "time",
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

// The artwork accent as "#RRGGBB", lifted so it reads on black; null before the palette loads.
export function tintHex(color: string): string | null {
  const c = readable(color);
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toUpperCase();
  const m = c.match(/\d+/g);
  if (!m || m.length < 3) return null;
  return `#${m
    .slice(0, 3)
    .map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

const isPlaying = (s: PlayerStatus) =>
  s === "playing" || s === "buffering" || s === "loading";

let stopController: (() => void) | null = null;

/** Call once from the app root. Returns a stop function (handy for fast refresh). */
export function startIslandController(): () => void {
  if (stopController) return stopController;
  if (!PawseActivity.available) return () => {};

  let active = false;
  let starting = false;
  let frame = 0;
  let flash: {
    mood: ActivityMood;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let beat: ReturnType<typeof setInterval> | undefined;
  let drift: ReturnType<typeof setInterval> | undefined;
  let backgroundSince = AppState.currentState === "active" ? 0 : Date.now();
  let art: { id: string; file: string | null } = { id: "", file: null };
  let startMs = 0;
  let lastKey = "";
  let sending = false;
  // The island already shows the tapped state; the player's own state catches up a moment later.
  let hold: { playing: boolean; timer: ReturnType<typeof setTimeout> } | null =
    null;
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
      mood:
        flash?.mood ?? (playing ? songVibe(track, s.source?.title) : "sleep"),
      frame,
      start: Math.round(startMs),
      end: Math.round(startMs + duration * 1000),
      // Playing bars move on their own from start/end; a fixed value keeps the state from changing every read.
      progress:
        duration && !(playing && duration > 0)
          ? Math.min(1, position / duration)
          : 0,
      color: prefs.color,
      mouse: showing ? (CAMEO_FRAMES[cameo.step] ?? 0) : 0,
      name: prefs.name,
      // Follows Settings → Appearance → Accent colour, like the rest of the app.
      tint: tintHex(
        getSetting<string>("accentMode", "artwork") === "fixed"
          ? getSetting("accentColor", "#8B7CFF")
          : useNowPalette.getState().palette.accent,
      ),
      staleAt: staleAt(playing, startMs + duration * 1000),
      style: prefs.style,
    };
  }

  // One native call in flight at a time; only the newest pending state is kept.
  // A call that hangs is let go after SEND_TIMEOUT_MS so later updates never pile up behind it.
  function send(state: ActivityState) {
    if (sending) {
      queued = state;
      return;
    }
    sending = true;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      clearTimeout(timer);
      sending = false;
      const next = queued;
      queued = null;
      if (next && active) send(next);
    };
    const timer = setTimeout(release, SEND_TIMEOUT_MS);
    void PawseActivity.update(state)
      .then((alive) => {
        if (!alive && active) lost();
      })
      .finally(release);
  }

  // iOS ended the activity (its time limit) or it was swiped away: start again when we next can.
  function lost() {
    active = false;
    lastKey = "";
    queued = null;
    syncBeat();
    syncDrift();
    if (AppState.currentState === "active") onChange();
  }

  function push() {
    if (!active) return;
    const state = compose();
    if (!state) return;
    if (hold && state.isPlaying !== hold.playing) return;
    const key = JSON.stringify(state);
    if (key === lastKey) return;
    lastKey = key;
    send(state);
  }

  async function begin() {
    if (starting || active) return;
    const state = compose();
    // Island cat off: no activity at all, so iOS's own Now Playing island is the only one.
    if (!state || !catPrefs().island || !PawseActivity.isSupported()) return;
    starting = true;
    // iOS refuses to start an activity from the background; we retry when the app is active again.
    const ok = await PawseActivity.start(state);
    starting = false;
    if (
      !ok ||
      !isPlaying(usePlayerStore.getState().status) ||
      !catPrefs().island
    ) {
      if (ok) void PawseActivity.end();
      return;
    }
    active = true;
    lastKey = JSON.stringify(state);
    push();
    syncBeat();
    syncDrift();
  }

  function finish() {
    active = false;
    lastKey = "";
    queued = null;
    syncBeat();
    syncDrift();
    void PawseActivity.end();
  }

  // Buffering and seeks shift the song's timeline; compose only sends a new state when it moved.
  function syncDrift() {
    const want = active && isPlaying(usePlayerStore.getState().status);
    if (want && !drift) drift = setInterval(push, DRIFT_CHECK_MS);
    else if (!want && drift) {
      clearInterval(drift);
      drift = undefined;
    }
  }

  // The bar-free square from the Now Playing art when there is one, else the thumbnail.
  function loadArt(track: Track) {
    art = { id: track.id, file: null };
    const fallback = bestThumbnail(track.thumbnails, ART_PX);
    void prepareArtwork(track)
      .then((square) => {
        const url = square ?? fallback;
        return url && art.id === track.id
          ? PawseActivity.setArtwork(url)
          : null;
      })
      .then((file) => {
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
      if (cameo.step === CAMEO_FRAMES.length) {
        setFlash("happy", HAPPY_MS);
        // The mouse comes back later in a long song.
        const [a, b] = CAMEO_AGAIN_SEC;
        const next = getProgress().position + a + Math.random() * (b - a);
        const duration = current()?.durationSec ?? 0;
        if (duration && next < duration - 20)
          cameo = { trackId: cameo.trackId, atSec: next, step: -1 };
      }
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
    // Only ticks while a mouse visit is still due for this song; otherwise nothing changes between songs.
    const want =
      active &&
      cameo.trackId === current()?.id &&
      cameo.step < CAMEO_FRAMES.length &&
      isPlaying(usePlayerStore.getState().status) &&
      backgroundSince > 0 &&
      Date.now() - backgroundSince < BACKGROUND_BEAT_BUDGET_MS;
    if (want && !beat) {
      beat = setInterval(() => {
        const spent = Date.now() - backgroundSince;
        if (spent < BACKGROUND_BEAT_BUDGET_MS) stepCameo(spent);
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
    syncDrift();
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
  // Native already flipped play/pause on the island, so the next real state must always be sent.
  const unsubAction = PawseActivity.onAction((action) => {
    lastKey = "";
    if (action === "next") return player.next();
    if (action === "previous") return player.previous();
    const playing = !isPlaying(usePlayerStore.getState().status);
    if (hold) clearTimeout(hold.timer);
    hold = {
      playing,
      timer: setTimeout(() => {
        hold = null;
        lastKey = "";
        push();
      }, TOGGLE_HOLD_MS),
    };
    player.toggle();
  });
  let seekTimer: ReturnType<typeof setTimeout> | undefined;
  const unsubSeeked = onPlayerEvent("seeked", () => {
    clearTimeout(seekTimer);
    seekTimer = setTimeout(push, SEEK_SETTLE_MS);
  });
  // The artwork colour arrives a moment after the song changes.
  const unsubPalette = useNowPalette.subscribe(() => push());
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
    void PawseActivity.end();
  onChange();

  stopController = () => {
    unsubStore();
    unsubLiked();
    unsubSkipped();
    unsubAction();
    unsubSeeked();
    clearTimeout(seekTimer);
    if (drift) clearInterval(drift);
    unsubPalette();
    unsubSettings();
    appState.remove();
    if (flash) clearTimeout(flash.timer);
    if (beat) clearInterval(beat);
    stopController = null;
  };
  return stopController;
}
