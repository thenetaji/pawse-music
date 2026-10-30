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
  type ActivityState,
  type IslandStyle,
  PawseActivity,
} from "../../../modules/pawse-activity";
import { useLibrary } from "../../data/library";
import { prepareArtwork } from "../../lib/artwork";
import { getSetting } from "../../lib/settings";
import { songVibe } from "../../lib/vibe";
import { readable, useNowPalette } from "../now-playing/now-palette";
import { moodGlow } from "./glow";

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

const ART_PX = 300;

const ISLAND_STYLES: readonly IslandStyle[] = ["classic", "time"];

type IslandPrefs = {
  island: boolean;
  style: IslandStyle;
};

// Read loosely so older saved settings work; a retired style ("wire", "cat", "lyrics", "paws") shows Classic.
function islandPrefs(): IslandPrefs {
  const s = (useLibrary.getState().settings ?? {}) as Record<string, unknown>;
  return {
    island: s.pawseIsland === true,
    style: ISLAND_STYLES.find((v) => v === s.islandStyle) ?? "classic",
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
  let drift: ReturnType<typeof setInterval> | undefined;
  let art: { id: string; file: string | null } = { id: "", file: null };
  let startMs = 0;
  let lastKey = "";
  let sending = false;
  // The island already shows the tapped state; the player's own state catches up a moment later.
  let hold: { playing: boolean; timer: ReturnType<typeof setTimeout> } | null =
    null;
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
    const vibe = songVibe(track, s.source?.title);
    const tint = tintHex(
      getSetting<string>("accentMode", "artwork") === "fixed"
        ? getSetting("accentColor", "#8B7CFF")
        : useNowPalette.getState().palette.accent,
    );
    return {
      title: track.title,
      artist: artistLine(track.artists),
      artwork: art.id === track.id ? art.file : null,
      isPlaying: playing,
      start: Math.round(startMs),
      end: Math.round(startMs + duration * 1000),
      // The bars and ring move on their own from start/end while playing; only a pause needs a value.
      progress: duration && !playing ? Math.min(1, position / duration) : 0,
      // Follows Settings → Appearance → Accent colour, like the rest of the app.
      tint,
      glow: moodGlow(tint, vibe),
      staleAt: staleAt(playing, startMs + duration * 1000),
      style: islandPrefs().style,
      liked: useLibrary.getState().isLiked(track.id),
      disliked: useLibrary.getState().isDisliked(track.id),
      rate: getSetting<boolean>("islandRate", true) !== false,
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
    // Pawse's island off: no activity at all, so iOS's own Now Playing island is the only one.
    if (!state || !islandPrefs().island || !PawseActivity.isSupported()) return;
    starting = true;
    // iOS refuses to start an activity from the background; we retry when the app is active again.
    const ok = await PawseActivity.start(state);
    starting = false;
    if (
      !ok ||
      !isPlaying(usePlayerStore.getState().status) ||
      !islandPrefs().island
    ) {
      if (ok) void PawseActivity.end();
      return;
    }
    active = true;
    lastKey = JSON.stringify(state);
    push();
    syncDrift();
  }

  function finish() {
    active = false;
    lastKey = "";
    queued = null;
    syncDrift();
    void PawseActivity.end();
  }

  // Buffering and seeks shift the song's timeline; compose only sends a new state when it moved.
  function syncDrift() {
    const want = active && isPlaying(usePlayerStore.getState().status);
    if (!want && drift) {
      clearInterval(drift);
      drift = undefined;
    } else if (want && !drift) {
      drift = setInterval(push, DRIFT_CHECK_MS);
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
  // Native already flipped play/pause on the island, so the next real state must always be sent.
  const unsubAction = PawseActivity.onAction((action) => {
    lastKey = "";
    if (action === "next") return player.next();
    if (action === "previous") return player.previous();
    const track = current();
    if (action === "like")
      return void (track && useLibrary.getState().toggleLike(track));
    if (action === "dislike")
      return void (track && useLibrary.getState().toggleDislike(track));
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
  // A like or dislike (from the island or the app) shows on the island's buttons.
  const unsubLikes = useLibrary.subscribe((s, prev) => {
    if (s.liked !== prev.liked || s.disliked !== prev.disliked) push();
  });
  const unsubSettings = useLibrary.subscribe((s, prev) => {
    if (s.settings === prev.settings) return;
    if (!islandPrefs().island) {
      if (active || starting) finish();
      return;
    }
    // Starts the activity if it was just switched on, or pushes the new style.
    onChange();
  });
  const appState = AppState.addEventListener("change", (st) => {
    if (st === "active") onChange();
  });

  // A previous process may have left an activity behind; start clean.
  if (!isPlaying(usePlayerStore.getState().status) || !islandPrefs().island)
    void PawseActivity.end();
  onChange();

  stopController = () => {
    unsubStore();
    unsubAction();
    unsubSeeked();
    clearTimeout(seekTimer);
    if (drift) clearInterval(drift);
    unsubPalette();
    unsubSettings();
    unsubLikes();
    appState.remove();
    stopController = null;
  };
  return stopController;
}
