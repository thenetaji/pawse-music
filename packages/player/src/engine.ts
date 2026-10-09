import TrackPlayer, {
  Event,
  type MediaItem,
  RepeatMode as NativeRepeat,
  type PlaybackErrorEvent,
  PlaybackState,
  PlayerCommand,
} from "@rntp/player";
import {
  artistLine,
  bestThumbnail,
  type ResolvedStream,
  type Track,
} from "@studio/music-core";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { POS_KEY, QUEUE_KEY } from "./keys";
import * as Q from "./queue";
import { emitPlayerEvent, type StoreState, usePlayerStore } from "./store";
import type {
  Player,
  PlayerStatus,
  PlayOptions,
  Progress,
  RadioSeed,
  RepeatMode,
  SetupOptions,
} from "./types";

const REFRESH_MS = 10 * 60_000;
const AHEAD = 2;
const FINISHED_AT = 0.8;
const RADIO_LOW = 3;
const TICK_MS = 5_000;
const SAVE_MS = 1_000;
const POS_EVERY_SEC = 15;
const MAX_SKIPS = 5;

export { POS_KEY, QUEUE_KEY };

const PLACEHOLDER = "https://flow.invalid/pending/";
const NATIVE_REPEAT: Record<RepeatMode, NativeRepeat> = {
  off: NativeRepeat.Off,
  all: NativeRepeat.All,
  one: NativeRepeat.One,
};

const get = usePlayerStore.getState;
const set = (patch: Partial<StoreState>) => usePlayerStore.setState(patch);

let opts: SetupOptions | null = null;
let setupPromise: Promise<void> | null = null;
const streams = new Map<string, ResolvedStream>(); // by track id
const inflight = new Map<string, Promise<ResolvedStream>>();
const live = new Map<string, number>(); // entry key -> expiresAt of the URL the native queue holds
const retried = new Map<string, number>(); // entry key -> position of the last error re-resolve
let nativeLoaded = false;
let pendingSeek: { key: string; position: number } | undefined;
let navGen = 0;
let queueGen = 0;
let radio = {
  continuation: undefined as string | undefined,
  playlistId: undefined as string | undefined,
  busy: false,
  done: false,
};
let currentKey: string | undefined;
let playedFired = false;
let finishedFired = false;
let ahead = AHEAD;
let savedPos = 0;
let wantPlay = false;
let loading = false;
let playing = false;
let nativeState: PlaybackState = PlaybackState.Idle;
let ticker: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let stallTimer: ReturnType<typeof setTimeout> | undefined;
const STALL_MS = 8000;
const diag = (kind: string, detail?: string) =>
  opts?.onDiagnostic?.(kind, detail);
let endTimer: ReturnType<typeof setTimeout> | undefined;

// iOS can misread the length of YouTube's audio files and keep "playing" silence past the end.
const trustedDuration = (track?: Track) =>
  track ? (streams.get(track.id)?.durationSec ?? track.durationSec) : undefined;
const disagrees = (native: number, trusted: number) =>
  !native || Math.abs(native - trusted) > Math.max(10, trusted * 0.15);
function chooseDuration(native: number, track?: Track): number {
  const trusted = trustedDuration(track);
  return trusted && disagrees(native, trusted) ? trusted : native;
}

// Floor at about -9 dB: estimated loudness can overshoot, and a near-silent song reads as "no audio".
export function normalizeVolume(loudnessDb?: number): number {
  return loudnessDb && loudnessDb > 0
    ? Q.clamp(10 ** (-loudnessDb / 20), 0.35, 1)
    : 1;
}

const isFresh = (expiresAt?: number) =>
  expiresAt !== undefined && expiresAt - Date.now() > REFRESH_MS;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function syncStatus(): void {
  const s = get();
  let status: PlayerStatus;
  if (loading) status = "loading";
  else if (playing) status = "playing";
  else if (nativeState === PlaybackState.Error) status = "error";
  else if (wantPlay && nativeState === PlaybackState.Buffering)
    status = "buffering";
  else status = s.tracks.length ? "paused" : "idle";
  if (status !== s.status) set({ status });
}

function resolveStream(track: Track, force = false): Promise<ResolvedStream> {
  const cached = streams.get(track.id);
  if (!force && cached && isFresh(cached.expiresAt))
    return Promise.resolve(cached);
  let p = inflight.get(track.id);
  if (!p) {
    p = opts!.resolver
      .resolve(track)
      .then((st) => (streams.set(track.id, st), st))
      .finally(() => inflight.delete(track.id));
    inflight.set(track.id, p);
  }
  return p;
}

function mediaItem(key: string, track: Track): MediaItem {
  const st = streams.get(track.id);
  const ok = st && isFresh(st.expiresAt);
  if (ok) live.set(key, st.expiresAt);
  else live.delete(key);
  return {
    mediaId: key,
    url: ok
      ? st.headers
        ? { uri: st.url, headers: st.headers }
        : st.url
      : PLACEHOLDER + key,
    mimeType: ok ? st.mimeType.split(";")[0] : undefined,
    title: track.title,
    artist: artistLine(track.artists),
    albumTitle: track.album?.title,
    artworkUrl: bestThumbnail(track.thumbnails, 544),
    duration: trustedDuration(track),
    extras: { trackId: track.id },
  };
}

const itemAt = (i: number) => mediaItem(get().keys[i], get().tracks[i]);

/** Makes entry i playable: resolved into the cache, and swapped into the native queue when loaded. */
async function ensureReady(i: number, force = false): Promise<boolean> {
  const { keys, tracks } = get();
  const key = keys[i];
  const track = tracks[i];
  if (!track) return false;
  if (
    !force &&
    (nativeLoaded
      ? isFresh(live.get(key))
      : isFresh(streams.get(track.id)?.expiresAt))
  )
    return true;
  try {
    const st = await resolveStream(track, force);
    const at = get().keys.indexOf(key);
    if (nativeLoaded && at >= 0 && live.get(key) !== st.expiresAt)
      TrackPlayer.replaceMediaItem(at, mediaItem(key, track));
    return true;
  } catch (e) {
    set({ error: errorText(e) });
    return false;
  }
}

/** How many upcoming songs get resolved ahead (data saver uses 1); no argument restores the default. */
export function setPrefetchAhead(n?: number): void {
  ahead = n === undefined ? AHEAD : Math.max(0, Math.round(n));
}

function ensureAhead(): void {
  const { index, tracks } = get();
  for (let i = index + 1; i <= index + ahead && i < tracks.length; i++)
    void ensureReady(i);
}

function loadNative(i: number): void {
  const s = get();
  TrackPlayer.setMediaItems(
    s.tracks.map((t, j) => mediaItem(s.keys[j], t)),
    i,
  );
  nativeLoaded = true;
  TrackPlayer.setRepeatMode(NATIVE_REPEAT[s.repeat]);
  if (pendingSeek?.key === s.keys[i] && pendingSeek.position > 0)
    TrackPlayer.seekTo(pendingSeek.position);
  pendingSeek = undefined;
}

function applyVolume(): void {
  const s = get();
  const t = s.tracks[s.index];
  if (!nativeLoaded || !t) return;
  TrackPlayer.setVolume(
    s.normalize
      ? normalizeVolume(streams.get(t.id)?.loudnessDb ?? t.loudnessDb)
      : 1,
  );
}

/** Bookkeeping when entry `key` becomes current (from our navigation or a native transition). */
function entered(key: string, rearmSleep: boolean): void {
  const s = get();
  const i = s.keys.indexOf(key);
  if (i < 0) return;
  if (i !== s.index) set({ index: i });
  if (key !== currentKey) {
    currentKey = key;
    playedFired = false;
    finishedFired = false;
    savedPos = 0;
    emitPlayerEvent("trackChanged", s.tracks[i]);
    const st = streams.get(s.tracks[i].id);
    diag("track", `${s.tracks[i].id} via=${st?.via ?? "?"}`);
  }
  if (rearmSleep && s.sleepAt === "endOfTrack")
    TrackPlayer.sleepAfterMediaItemAtIndex(i);
  // Native advanced onto a URL that is about to expire: swap it now (placeholders are left to onError).
  if (nativeLoaded && !loading && live.has(key) && !isFresh(live.get(key)))
    void swapCurrent(true);
  applyVolume();
  ensureAhead();
  void refill();
  savePosition(0);
}

async function goTo(
  target: number,
  gen: number,
  autoplay = true,
): Promise<void> {
  let i = target;
  loading = true;
  syncStatus();
  for (
    let tries = 0;
    tries < MAX_SKIPS && i >= 0 && i < get().tracks.length;
    tries++, i++
  ) {
    const ok = await ensureReady(i);
    if (gen !== navGen) return;
    if (!ok) continue;
    if (nativeLoaded) TrackPlayer.skipToIndex(i);
    else loadNative(i);
    set({ index: i });
    wantPlay = autoplay;
    if (autoplay) TrackPlayer.play();
    loading = false;
    entered(get().keys[i], true);
    syncStatus();
    return;
  }
  loading = false;
  nativeState = PlaybackState.Error;
  syncStatus();
}

async function start(
  tracks: Track[],
  startIndex: number,
  o: PlayOptions,
  seed?: { continuation?: string; playlistId?: string },
) {
  need();
  const gen = ++navGen;
  queueGen++;
  let q = Q.createQueue(tracks, startIndex);
  if (get().shuffle) q = Q.shuffle(q);
  radio = {
    continuation: seed?.continuation,
    playlistId: seed?.playlistId,
    busy: false,
    done: false,
  };
  retried.clear();
  nativeLoaded = false;
  pendingSeek = undefined;
  currentKey = undefined;
  set({ ...q, source: o.source, radio: !!o.radio, error: undefined });
  saveQueue();
  if (!q.tracks.length) {
    TrackPlayer.clear();
    return syncStatus();
  }
  await goTo(q.index, gen);
}

function need(): SetupOptions {
  if (!opts) throw new Error("setupPlayer() must run before playback");
  return opts;
}

async function refill(): Promise<void> {
  const s = get();
  const catalog = opts?.catalog;
  const auto =
    !s.radio && s.repeat === "off" && (opts?.radioContinue?.() ?? false);
  if (
    !(s.radio || auto) ||
    !catalog ||
    radio.busy ||
    radio.done ||
    !s.tracks.length ||
    Q.remaining(s) >= RADIO_LOW
  )
    return;
  radio.busy = true;
  const gen = queueGen;
  try {
    const last = s.tracks[s.tracks.length - 1];
    const res = await catalog.upNext(
      radio.continuation
        ? { playlistId: radio.playlistId, continuation: radio.continuation }
        : { videoId: last.id, playlistId: radio.playlistId },
    );
    if (gen !== queueGen) return;
    radio.continuation = res.continuation;
    radio.playlistId = res.playlistId ?? radio.playlistId;
    const fresh = Q.freshTracks(get(), res.tracks);
    if (!fresh.length) {
      radio.done = !res.continuation;
      return;
    }
    appendEntries(fresh);
  } catch {
    // Radio is best effort; the next transition tries again.
  } finally {
    if (gen === queueGen) radio.busy = false;
  }
}

function appendEntries(tracks: Track[]): void {
  const before = get();
  const q = Q.append(before, tracks);
  set(q);
  if (nativeLoaded)
    TrackPlayer.addMediaItems(
      tracks.map((_, j) => itemAt(before.tracks.length + j)),
    );
  saveQueue();
  ensureAhead();
}

/** Rewrites the native queue around the playing item after a reorder of our model. */
function syncNativeOrder(oldIndex: number, oldLength: number): void {
  if (!nativeLoaded) return;
  const s = get();
  if (oldIndex + 1 < oldLength)
    TrackPlayer.removeMediaItems(oldIndex + 1, oldLength);
  if (oldIndex > 0) TrackPlayer.removeMediaItems(0, oldIndex);
  const items = s.tracks.map((t, j) => mediaItem(s.keys[j], t));
  if (s.index > 0) TrackPlayer.insertMediaItems(0, items.slice(0, s.index));
  if (s.index + 1 < items.length)
    TrackPlayer.addMediaItems(items.slice(s.index + 1));
}

async function onError(e: PlaybackErrorEvent): Promise<void> {
  if (e.code === "play-not-permitted") return;
  diag("error", `${e.code}: ${e.message}`);
  if (e.code === "controller-connection-failed")
    return set({ error: e.message });
  const s = get();
  const key = s.keys[s.index];
  const track = s.tracks[s.index];
  if (!track) return;
  const gen = navGen;
  const position = TrackPlayer.getProgress().position || savedPos;
  const last = retried.get(key);
  // One re-resolve per incident; a track that played 30 s since the last retry earns another.
  if (last === undefined || position > last + 30) {
    retried.set(key, position);
    loading = true;
    syncStatus();
    try {
      await resolveStream(track, live.has(key));
      if (gen !== navGen || get().keys[get().index] !== key) return;
      TrackPlayer.replaceMediaItem(get().index, mediaItem(key, track));
      if (position > 0) TrackPlayer.seekTo(position);
      if (wantPlay) TrackPlayer.play();
      loading = false;
      nativeState = PlaybackState.Buffering;
      syncStatus();
      return;
    } catch (err) {
      diag("resolve-failed", `${track.id}: ${errorText(err)}`);
      set({ error: errorText(err) });
    }
  } else set({ error: e.message });
  loading = false;
  if (gen !== navGen) return;
  const now = get();
  const n = Q.stepIndex(now.tracks.length, now.index, 1, now.repeat === "all");
  if (n !== null && n !== now.index) await goTo(n, ++navGen, wantPlay);
  else syncStatus();
}

function tick(): void {
  const s = get();
  const track = s.tracks[s.index];
  if (!track || !nativeLoaded) return;
  const { position, duration } = TrackPlayer.getProgress();
  const dur = chooseDuration(duration, track) || 0;
  if (!playedFired && (position >= 30 || (dur > 0 && position >= dur / 2))) {
    playedFired = true;
    opts?.onPlayed?.(track, Math.round(position));
  }
  // Played past 80%: counts as finished (the tick before the end always lands past it).
  if (!finishedFired && dur > 0 && position >= dur * FINISHED_AT) {
    finishedFired = true;
    emitPlayerEvent("finished", track);
  }
  if (Math.abs(position - savedPos) >= POS_EVERY_SEC) savePosition(position);
  guardEnd(position, duration, track);
}

// When the player's own length is wrong, end the song at its real length instead of playing silence.
function guardEnd(position: number, native: number, track: Track): void {
  clearTimeout(endTimer);
  const trusted = trustedDuration(track);
  if (!playing || !trusted || !disagrees(native, trusted) || native < trusted)
    return;
  const left = trusted + 1.5 - position;
  if (left > TICK_MS / 1000) return;
  const key = get().keys[get().index];
  endTimer = setTimeout(
    () => {
      const s = get();
      if (s.keys[s.index] !== key || !playing) return;
      diag(
        "duration-guard",
        `${track.id} native=${Math.round(native)}s real=${Math.round(trusted)}s`,
      );
      if (s.repeat === "one") return void TrackPlayer.seekTo(0);
      const n = Q.stepIndex(s.tracks.length, s.index, 1, s.repeat === "all");
      if (n !== null && n !== s.index) void goTo(n, ++navGen, true);
      else {
        pause();
        seekTo(0);
      }
    },
    Math.max(0, left * 1000),
  );
}

function savePosition(position: number): void {
  savedPos = position;
  const key = get().keys[get().index];
  if (key)
    void opts?.storage
      ?.set(POS_KEY, JSON.stringify({ key, position }))
      .catch(() => {});
}

function saveQueue(): void {
  if (!opts?.storage) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = get();
    const data = {
      tracks: s.tracks,
      keys: s.keys,
      index: s.index,
      original: s.original,
      source: s.source,
      shuffle: s.shuffle,
      repeat: s.repeat,
      normalize: s.normalize,
      radio: {
        on: s.radio,
        continuation: radio.continuation,
        playlistId: radio.playlistId,
      },
    };
    void opts?.storage?.set(QUEUE_KEY, JSON.stringify(data)).catch(() => {});
  }, SAVE_MS);
}

async function restore(): Promise<void> {
  const storage = opts?.storage;
  if (!storage) return;
  const [rawQ, rawP] = await Promise.all([
    storage.get(QUEUE_KEY),
    storage.get(POS_KEY),
  ]);
  if (!rawQ || get().tracks.length) return;
  const d = JSON.parse(rawQ) as {
    tracks: Track[];
    keys: string[];
    index: number;
    original: string[] | null;
    source?: StoreState["source"];
    shuffle: boolean;
    repeat: RepeatMode;
    normalize: boolean;
    radio?: { on: boolean; continuation?: string; playlistId?: string };
  };
  if (!Array.isArray(d.tracks) || d.tracks.length !== d.keys?.length) return;
  const pos = rawP
    ? (JSON.parse(rawP) as { key: string; position: number })
    : undefined;
  const at = pos ? d.keys.indexOf(pos.key) : -1;
  const index = Q.clamp(at >= 0 ? at : d.index, 0, d.tracks.length - 1);
  radio = {
    continuation: d.radio?.continuation,
    playlistId: d.radio?.playlistId,
    busy: false,
    done: false,
  };
  if (at >= 0 && pos) pendingSeek = { key: pos.key, position: pos.position };
  savedPos = pendingSeek?.position ?? 0;
  set({
    tracks: d.tracks,
    keys: d.keys,
    index,
    original: d.original ?? null,
    source: d.source,
    shuffle: !!d.shuffle,
    repeat: d.repeat ?? "off",
    normalize: d.normalize ?? true,
    radio: !!d.radio?.on,
  });
  TrackPlayer.setRepeatMode(NATIVE_REPEAT[get().repeat]);
  syncStatus();
}

/** Idempotent. The sync part runs before the first await so headless starts get handlers. */
export function setupPlayer(o: SetupOptions): Promise<void> {
  opts = o;
  if (setupPromise) return setupPromise;
  TrackPlayer.setupPlayer({
    contentType: "music",
    handleAudioBecomingNoisy: o.pauseOnDisconnect ?? true,
    android: { wakeMode: "network" },
  });
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Next,
      PlayerCommand.Previous,
      PlayerCommand.Seek,
    ],
  });
  TrackPlayer.registerRemoteHandlers({
    play: () => resume(),
    pause: () => pause(),
    next: () => (set({ error: undefined }), step(1)),
    previous: () => (set({ error: undefined }), back()),
    seek: ({ position }) => seekTo(position),
  });
  TrackPlayer.addEventListener(
    Event.MediaItemTransition,
    ({ item, reason }) => {
      if (!item?.mediaId) return;
      if (reason === "repeat") playedFired = finishedFired = false;
      entered(item.mediaId, reason === "seek" || reason === "playlistChanged");
    },
  );
  TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
    nativeState = state;
    syncStatus();
    // A stream stuck buffering gets a fresh URL and resumes where it was.
    clearTimeout(stallTimer);
    if (state === PlaybackState.Buffering && wantPlay)
      stallTimer = setTimeout(() => {
        if (nativeState === PlaybackState.Buffering && wantPlay)
          void onError({
            code: "stalled",
            message: "Playback stalled",
          } as unknown as PlaybackErrorEvent);
      }, STALL_MS);
  });
  // Going to the background mid-song: re-assert playback, but never over a call or Siri pause.
  AppState.addEventListener("change", (st) => {
    if (wantPlay) diag("app", `${st} native=${nativeState}`);
    if (st === "background" && wantPlay && nativeLoaded && playing) {
      diag("background-nudge");
      TrackPlayer.play();
    }
  });
  TrackPlayer.addEventListener(Event.IsPlayingChanged, ({ playing: on }) => {
    // A pause nobody asked for: a call, Siri, another app or headphones unplugged.
    if (!on && wantPlay && !loading) diag("paused-by-system", nativeState);
    playing = on;
    clearInterval(ticker);
    ticker = on ? setInterval(tick, TICK_MS) : undefined;
    if (!on) tick();
    syncStatus();
  });
  TrackPlayer.addEventListener(Event.PlaybackError, (e) => onError(e));
  TrackPlayer.addEventListener(Event.SleepTimerTriggered, () => {
    wantPlay = false;
    set({ sleepAt: undefined });
  });
  setupPromise = restore().catch(() => {});
  return setupPromise;
}

function step(dir: 1 | -1): Promise<void> {
  const s = get();
  const n = Q.stepIndex(s.tracks.length, s.index, dir, s.repeat === "all");
  if (n === null) return Promise.resolve();
  return goTo(n, ++navGen);
}

function back(): Promise<void> {
  const pos = nativeLoaded ? TrackPlayer.getProgress().position : 0;
  const s = get();
  if (
    pos > 3 ||
    Q.stepIndex(s.tracks.length, s.index, -1, s.repeat === "all") === null
  ) {
    seekTo(0);
    return Promise.resolve();
  }
  return step(-1);
}

function pause(): void {
  wantPlay = false;
  if (nativeLoaded) {
    TrackPlayer.pause();
    savePosition(TrackPlayer.getProgress().position);
  }
  emitPlayerEvent("paused", get().tracks[get().index]);
}

async function resume(): Promise<void> {
  const s = get();
  if (!s.tracks.length || !opts) return;
  if (!nativeLoaded) return goTo(s.index, ++navGen);
  wantPlay = true;
  const key = s.keys[s.index];
  // A long pause can outlive the URL, and an errored item needs a new one.
  if (!isFresh(live.get(key)) || nativeState === PlaybackState.Error)
    await swapCurrent(live.has(key));
  else {
    TrackPlayer.play();
    syncStatus();
  }
  ensureAhead();
}

/** Re-resolves the current entry and swaps it in at the same position. */
async function swapCurrent(force: boolean): Promise<void> {
  const s = get();
  const position = TrackPlayer.getProgress().position;
  const gen = ++navGen;
  loading = true;
  syncStatus();
  const ok = await ensureReady(s.index, force);
  loading = false;
  if (gen !== navGen) return;
  if (!ok) return step(1);
  if (position > 0) TrackPlayer.seekTo(position);
  if (wantPlay) TrackPlayer.play();
  syncStatus();
}

function seekTo(sec: number): void {
  const s = get();
  const real = trustedDuration(s.tracks[s.index]);
  if (real) sec = Math.min(sec, Math.max(0, real - 1));
  if (nativeLoaded) TrackPlayer.seekTo(sec);
  else if (s.keys[s.index])
    pendingSeek = { key: s.keys[s.index], position: sec };
  savePosition(sec);
}

function mutate(q: Q.Queue): void {
  set({ tracks: q.tracks, keys: q.keys, index: q.index, original: q.original });
  saveQueue();
  syncStatus();
}

export const player: Player = {
  play: (tracks, startIndex = 0, o = {}) => start(tracks, startIndex, o),
  async playRadio(seed: RadioSeed) {
    const catalog = need().catalog;
    if (!catalog) throw new Error("playRadio needs a catalog");
    const gen = ++navGen;
    loading = true;
    syncStatus();
    try {
      const res = await catalog.upNext({
        videoId: seed.videoId,
        playlistId: seed.playlistId,
      });
      if (gen !== navGen) return;
      loading = false;
      await start(
        res.tracks,
        0,
        {
          source: {
            type: "radio",
            id: seed.playlistId ?? seed.videoId,
            title: seed.title,
          },
          radio: true,
        },
        {
          continuation: res.continuation,
          playlistId: res.playlistId ?? seed.playlistId,
        },
      );
    } catch (e) {
      loading = false;
      set({ error: errorText(e) });
      syncStatus();
    }
  },
  toggle() {
    const st = get().status;
    if (st === "playing" || st === "buffering" || st === "loading") pause();
    else void resume();
  },
  pause,
  resume: () => void resume(),
  next() {
    const s = get();
    emitPlayerEvent("skipped", s.tracks[s.index]);
    set({ error: undefined });
    void step(1);
  },
  previous() {
    set({ error: undefined });
    void back();
  },
  seekTo,
  addNext(track) {
    const q = Q.insertNext(get(), track);
    mutate(q);
    const at = get().tracks.length === 1 ? 0 : q.index + 1;
    if (nativeLoaded) TrackPlayer.insertMediaItem(at, itemAt(at));
    ensureAhead();
  },
  addToQueue(track) {
    appendEntries([track]);
  },
  move(from, to) {
    const q = Q.move(get(), from, to);
    if (q === get()) return;
    mutate(q);
    if (nativeLoaded) TrackPlayer.moveMediaItem(from, to);
    ensureAhead();
  },
  remove(index) {
    const s = get();
    if (index < 0 || index >= s.tracks.length) return;
    const wasCurrent = index === s.index;
    live.delete(s.keys[index]);
    mutate(Q.remove(s, index));
    if (!nativeLoaded) return syncStatus();
    if (!get().tracks.length) {
      TrackPlayer.clear();
      nativeLoaded = false;
      currentKey = undefined;
      return syncStatus();
    }
    TrackPlayer.removeMediaItem(index);
    if (wasCurrent) entered(get().keys[get().index], true);
    else ensureAhead();
  },
  skipTo(index) {
    set({ error: undefined });
    void goTo(index, ++navGen);
  },
  setShuffle(on) {
    const s = get();
    if (on === s.shuffle) return;
    const q = on ? Q.shuffle(s) : Q.unshuffle(s);
    set({ shuffle: on });
    mutate(q);
    syncNativeOrder(s.index, s.tracks.length);
    ensureAhead();
  },
  setRepeat(mode) {
    set({ repeat: mode });
    if (nativeLoaded) TrackPlayer.setRepeatMode(NATIVE_REPEAT[mode]);
    saveQueue();
  },
  setSleepTimer(value) {
    if (value === null) {
      TrackPlayer.cancelSleepTimer();
      set({ sleepAt: undefined });
    } else if (value === "endOfTrack") {
      if (nativeLoaded) TrackPlayer.sleepAfterMediaItemAtIndex(get().index);
      set({ sleepAt: "endOfTrack" });
    } else {
      const seconds = Math.max(1, Math.round(value * 60));
      const fade = Math.max(0, opts?.sleepFadeSec?.() ?? 10);
      TrackPlayer.sleepAfterTime(seconds, {
        fadeOutSeconds: Math.min(fade, seconds),
      });
      set({ sleepAt: Date.now() + seconds * 1000 });
    }
  },
  setNormalize(on) {
    set({ normalize: on });
    applyVolume();
    saveQueue();
  },
};

function readProgress(): Progress {
  if (nativeLoaded) {
    const { position, duration, buffered } = TrackPlayer.getProgress();
    const track = get().tracks[get().index];
    const dur = chooseDuration(duration, track);
    return {
      position: Math.min(position, dur || position),
      duration: dur,
      buffered,
    };
  }
  const s = get();
  return {
    position: pendingSeek?.position ?? 0,
    duration: s.tracks[s.index]?.durationSec ?? 0,
    buffered: 0,
  };
}

/** One synchronous progress read, for controllers outside React (the Live Activity). */
export const getProgress = (): Progress => readProgress();

/** Polls once a second while the app is in the foreground; nothing runs in the background. */
export function useProgress(): Progress {
  const [progress, setProgress] = useState(readProgress);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;
    const run = (active: boolean) => {
      clearInterval(id);
      id = active
        ? setInterval(() => setProgress(readProgress()), 1000)
        : undefined;
    };
    run(AppState.currentState === "active");
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") setProgress(readProgress());
      run(st === "active");
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return progress;
}

/** Test hook: forget module state between tests. */
export function __resetForTests(): void {
  opts = null;
  setupPromise = null;
  streams.clear();
  inflight.clear();
  live.clear();
  retried.clear();
  nativeLoaded = false;
  pendingSeek = undefined;
  navGen = 0;
  queueGen = 0;
  radio = {
    continuation: undefined,
    playlistId: undefined,
    busy: false,
    done: false,
  };
  currentKey = undefined;
  playedFired = false;
  finishedFired = false;
  ahead = AHEAD;
  wantPlay = false;
  loading = false;
  playing = false;
  nativeState = PlaybackState.Idle;
  clearInterval(ticker);
  clearTimeout(saveTimer);
}
