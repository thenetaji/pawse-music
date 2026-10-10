// Writes each song played in Pawse to the listening journal, with how long it really played.
// Going to the background saves the song in progress; the final write replaces it (same key).
import { bestThumbnail, type Track } from "@pawse/music-core";
import {
  getProgress,
  onPlayerEvent,
  type QueueSource,
  usePlayerStore,
} from "@pawse/player";
import { AppState } from "react-native";

import { getSetting } from "../lib/settings";
import { recordEvent, recordPlay } from "./journal";
import type { JournalPlay } from "./journal-types";
import { onLike } from "./library";

const MIN_MS = 5_000;
const SKIP_MS = 30_000;
const FINISHED_AT = 0.85;
const ART_PX = 120;

type Current = {
  key: string;
  track: Track;
  source?: QueueSource;
  /** 0 until it first plays. */
  startedAt: number;
  listenedMs: number;
  playingSince: number;
  finished: boolean;
  durationSec?: number;
};

type StoreState = ReturnType<typeof usePlayerStore.getState>;

const paused = () => getSetting("pauseHistory", false);

let stopRecorder: (() => void) | null = null;

/** Call once from the app root. Returns a stop function (handy for fast refresh). */
export function startJournalRecorder(): () => void {
  if (stopRecorder) return stopRecorder;
  let cur: Current | undefined;

  const listened = (c: Current, now = Date.now()) =>
    c.listenedMs + (c.playingSince ? now - c.playingSince : 0);

  const toPlay = (c: Current, final: boolean): JournalPlay | undefined => {
    const ms = listened(c);
    if (!c.startedAt || ms < MIN_MS) return undefined;
    const dur = c.track.durationSec || c.durationSec;
    const finished = c.finished || (!!dur && ms >= dur * 1000 * FINISHED_AT);
    const t = c.track;
    const art = bestThumbnail(t.thumbnails, ART_PX);
    const ids = t.artists.map((a) => a.id ?? "");
    return {
      trackId: t.id,
      source: t.source,
      title: t.title,
      artists: t.artists.map((a) => a.name),
      ...(ids.some(Boolean) ? { artistIds: ids } : {}),
      ...(t.album ? { album: t.album.title, albumId: t.album.id } : {}),
      ...(dur ? { durationSec: Math.round(dur) } : {}),
      ...(art ? { art } : {}),
      startedAt: c.startedAt,
      listenedMs: Math.round(ms),
      ended: finished
        ? "finished"
        : final && ms < SKIP_MS
          ? "skipped"
          : "stopped",
      ...(c.source ? { context: c.source.type } : {}),
      ...(c.source?.title ? { contextTitle: c.source.title } : {}),
      origin: "pawse",
    };
  };

  const write = (c: Current | undefined, final: boolean) => {
    if (!c || paused()) return;
    const p = toPlay(c, final);
    if (p) void recordPlay(p).catch(() => {});
  };

  // Folds playing time in on every status change, and remembers how far the song got.
  const sample = (s: StoreState) => {
    if (!cur) return;
    const now = Date.now();
    if (s.status === "playing") {
      if (!cur.playingSince) cur.playingSince = now;
      if (!cur.startedAt) cur.startedAt = now;
    } else if (cur.playingSince) {
      cur.listenedMs += now - cur.playingSince;
      cur.playingSince = 0;
    }
    const { duration } = getProgress();
    if (duration > 0) cur.durationSec = duration;
  };

  const sync = (s: StoreState) => {
    const key = s.keys[s.index];
    const track = s.tracks[s.index];
    if (cur && (cur.key !== key || s.status === "idle")) {
      // Close the old song before the new one counts any time.
      if (cur.playingSince) {
        cur.listenedMs += Date.now() - cur.playingSince;
        cur.playingSince = 0;
      }
      write(cur, true);
      cur = undefined;
    }
    if (!cur && key && track && s.status !== "idle")
      cur = {
        key,
        track,
        source: s.source,
        startedAt: 0,
        listenedMs: 0,
        playingSince: 0,
        finished: false,
      };
    sample(s);
  };

  sync(usePlayerStore.getState());
  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    if (
      s.status !== prev.status ||
      s.index !== prev.index ||
      s.keys !== prev.keys
    )
      sync(s);
  });
  const unsubFinished = onPlayerEvent("finished", (t) => {
    if (cur && t?.id === cur.track.id) cur.finished = true;
  });
  // Repeat-one restarts the song without a track change: each finished loop is its own play.
  const unsubRepeat = onPlayerEvent("seeked", (t) => {
    if (!cur?.finished || t?.id !== cur.track.id) return;
    const now = Date.now();
    const playing = !!cur.playingSince;
    if (playing) cur.listenedMs += now - cur.playingSince;
    cur.playingSince = 0;
    write(cur, true);
    cur = {
      ...cur,
      startedAt: playing ? now : 0,
      listenedMs: 0,
      playingSince: playing ? now : 0,
      finished: false,
    };
  });
  const appState = AppState.addEventListener("change", (st) => {
    if (st === "background") write(cur, false);
  });
  const unsubLike = onLike((t, on) => {
    if (!paused())
      void recordEvent({
        at: Date.now(),
        kind: on ? "like" : "unlike",
        trackId: t.id,
      }).catch(() => {});
  });

  stopRecorder = () => {
    unsubStore();
    unsubFinished();
    unsubRepeat();
    appState.remove();
    unsubLike();
    stopRecorder = null;
  };
  return stopRecorder;
}
