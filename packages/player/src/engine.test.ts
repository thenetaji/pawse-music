import type { ResolvedStream, ResolveOptions, Track } from "@pawse/music-core";
import TrackPlayer from "@rntp/player";

import { Platform } from "react-native";

import {
  __resetForTests,
  getProgress,
  POS_KEY,
  player,
  refreshArtwork,
  restream,
  setupPlayer,
} from "./engine";
import { initialState, usePlayerStore } from "./store";
import type { KeyValueStore } from "./types";

type MockItem = { mediaId: string; url: unknown };
type MockListener = (payload: unknown) => unknown;

jest.mock("@rntp/player", () => {
  const listeners = new Map<string, MockListener>();
  const native = { queue: [] as MockItem[], index: 0, position: 0 };
  const api = {
    setupPlayer: jest.fn(),
    setCommands: jest.fn(),
    registerRemoteHandlers: jest.fn(() => ({ remove() {} })),
    addEventListener: jest.fn((e: string, cb: MockListener) => {
      listeners.set(e, cb);
      return { remove() {} };
    }),
    setMediaItems: jest.fn((items: MockItem[], i: number) => {
      native.queue = [...items];
      native.index = i;
      native.position = 0;
    }),
    addMediaItems: jest.fn((items: MockItem[]) => native.queue.push(...items)),
    insertMediaItem: jest.fn((i: number, item: MockItem) =>
      native.queue.splice(i, 0, item),
    ),
    insertMediaItems: jest.fn((i: number, items: MockItem[]) =>
      native.queue.splice(i, 0, ...items),
    ),
    removeMediaItem: jest.fn((i: number) => native.queue.splice(i, 1)),
    removeMediaItems: jest.fn((a: number, b: number) =>
      native.queue.splice(a, b - a),
    ),
    moveMediaItem: jest.fn(),
    updateMetadata: jest.fn(),
    replaceMediaItem: jest.fn(
      (i: number, item: MockItem) => (native.queue[i] = item),
    ),
    skipToIndex: jest.fn((i: number) => {
      native.index = i;
      native.position = 0;
    }),
    seekTo: jest.fn((p: number) => (native.position = p)),
    getProgress: () => ({
      position: native.position,
      duration: 200,
      buffered: 0,
      cached: 0,
    }),
    play: jest.fn(),
    pause: jest.fn(),
    clear: jest.fn(),
    setVolume: jest.fn(),
    setRepeatMode: jest.fn(),
    sleepAfterTime: jest.fn(),
    sleepAfterMediaItemAtIndex: jest.fn(),
    cancelSleepTimer: jest.fn(),
  };
  return {
    __esModule: true,
    default: api,
    __native: native,
    __emit: (e: string, payload: unknown) => listeners.get(e)?.(payload),
    Event: {
      MediaItemTransition: "event.media-item-transition",
      PlaybackStateChanged: "event.playback-state-changed",
      IsPlayingChanged: "event.is-playing-changed",
      PlaybackError: "event.playback-error",
      SleepTimerTriggered: "event.sleep-timer-triggered",
    },
    PlaybackState: {
      Idle: "idle",
      Ready: "ready",
      Buffering: "buffering",
      Ended: "ended",
      Error: "error",
    },
    PlayerCommand: {
      PlayPause: "playPause",
      Next: "next",
      Previous: "previous",
      Seek: "seek",
    },
    RepeatMode: { Off: "off", One: "one", All: "all" },
  };
});

const rntp = jest.requireMock("@rntp/player") as {
  default: Record<string, jest.Mock>;
  __native: {
    queue: { mediaId: string; url: unknown }[];
    index: number;
    position: number;
  };
  __emit: (e: string, p: unknown) => Promise<void> | void;
};
const native = rntp.__native;
const tp = TrackPlayer as unknown as Record<string, jest.Mock>;

const HOUR = 3_600_000;
const track = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: "A" }],
  thumbnails: [],
});
const tracks = (...ids: string[]) => ids.map(track);
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

let now = Date.UTC(2026, 9, 8);
let version = 0;
const defaultResolve = async (
  t: Pick<Track, "id">,
): Promise<ResolvedStream> => ({
  url: `https://a/${t.id}/${++version}`,
  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
  bitrate: 130_000,
  expiresAt: now + 6 * HOUR,
  via: "test",
});
const resolve = jest.fn(defaultResolve);
const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
  };
};
const urlAt = (i: number) => {
  const u = native.queue[i]?.url;
  return typeof u === "string" ? u : (u as { uri: string }).uri;
};
const resolvedIds = () => resolve.mock.calls.map(([t]) => t.id);

beforeEach(() => {
  __resetForTests();
  usePlayerStore.setState(initialState(), true);
  jest.clearAllMocks();
  resolve.mockImplementation(defaultResolve);
  native.queue = [];
  native.position = 0;
  now = Date.UTC(2026, 9, 8);
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => jest.restoreAllMocks());

test("play resolves the current track first and pre-resolves the next two into the native queue", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c", "d", "e"), 1);
  expect(resolvedIds()[0]).toBe("b");
  expect(tp.setMediaItems).toHaveBeenCalledWith(expect.any(Array), 1);
  expect(urlAt(1)).toMatch("https://a/b/");
  await flush();
  expect(resolvedIds().sort()).toEqual(["b", "c", "d"]);
  expect(urlAt(2)).toMatch("https://a/c/");
  expect(urlAt(3)).toMatch("https://a/d/");
  expect(urlAt(4)).toMatch("pawse.invalid");
  expect(usePlayerStore.getState().index).toBe(1);
});

test("resume after a long pause swaps in fresh URLs for the current and queued items, keeping the position", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c"));
  await flush();
  native.position = 95;
  player.pause();
  now += 5 * HOUR + 55 * 60_000;
  resolve.mockClear();
  tp.replaceMediaItem.mockClear();
  player.resume();
  await flush();
  expect(resolvedIds().sort()).toEqual(["a", "b", "c"]);
  expect(tp.replaceMediaItem.mock.calls.map(([i]) => i).sort()).toEqual([
    0, 1, 2,
  ]);
  expect(urlAt(0)).toMatch(/^https:\/\/a\/a\/[4-9]/);
  expect(tp.seekTo).toHaveBeenLastCalledWith(95);
  expect(tp.play).toHaveBeenCalled();
});

test("a playback error re-resolves once at the same position, then skips to the next track", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c"));
  await flush();
  native.position = 42;
  const before = urlAt(0);
  await rntp.__emit("event.playback-error", { code: "source", message: "403" });
  expect(urlAt(0)).not.toBe(before);
  expect(tp.seekTo).toHaveBeenLastCalledWith(42);
  expect(usePlayerStore.getState().index).toBe(0);

  await rntp.__emit("event.playback-error", {
    code: "source",
    message: "403 again",
  });
  expect(tp.skipToIndex).toHaveBeenLastCalledWith(1);
  expect(usePlayerStore.getState()).toMatchObject({
    index: 1,
    error: "403 again",
  });
});

test("a source error re-resolves with the next client, skips when none is left, and demotes a client only once it fails a second song", async () => {
  const clients = ["youtube:a", "youtube:b", "youtube:c"];
  const byClient = jest.fn(
    async (
      t: Pick<Track, "id">,
      o?: ResolveOptions,
    ): Promise<ResolvedStream> => {
      const left = clients.filter((c) => !o?.exclude?.includes(c));
      const via = [
        ...left.filter((c) => !o?.avoid?.includes(c)),
        ...left.filter((c) => o?.avoid?.includes(c)),
      ][0];
      if (!via) throw new Error("no client left");
      return {
        url: `https://a/${t.id}/${via}/${++version}`,
        mimeType: "audio/mp4",
        bitrate: 130_000,
        expiresAt: now + 6 * HOUR,
        via,
      };
    },
  );
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: byClient }, onDiagnostic: diag });
  await player.play(tracks("x", "y", "z"));
  await flush();
  expect(urlAt(1)).toMatch("/youtube:a/");
  const source = { code: "source", message: "Source error" };

  await rntp.__emit("event.playback-error", source);
  await flush();
  expect(diag).toHaveBeenCalledWith(
    "error",
    "source: Source error via=youtube:a",
  );
  expect(urlAt(0)).toMatch("/x/youtube:b/");
  expect(urlAt(1)).toMatch("/y/youtube:a/");
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
  expect(usePlayerStore.getState().index).toBe(0);

  await rntp.__emit("event.playback-error", source);
  expect(urlAt(0)).toMatch("/x/youtube:c/");
  await rntp.__emit("event.playback-error", source);
  await flush();
  expect(diag).toHaveBeenCalledWith("resolve-failed", "x: no client left");
  expect(usePlayerStore.getState().index).toBe(1);
  expect(tp.skipToIndex).toHaveBeenLastCalledWith(1);

  await rntp.__emit("event.playback-error", source);
  await flush();
  expect(diag).toHaveBeenCalledWith("source-avoided", "youtube:a");
  expect(urlAt(1)).toMatch("/y/youtube:b/");
});

test("radio refills from upNext when fewer than 3 remain, de-duplicated, then follows the continuation", async () => {
  const upNext = jest
    .fn()
    .mockResolvedValueOnce({
      tracks: tracks("c", "d", "e", "d"),
      continuation: "k1",
      playlistId: "RDAMVMa",
    })
    .mockResolvedValueOnce({ tracks: tracks("f"), continuation: "k2" });
  await setupPlayer({ resolver: { resolve }, catalog: { upNext } });
  await player.play(tracks("a", "b", "c"), 0, { radio: true });
  await flush();
  expect(upNext).toHaveBeenNthCalledWith(1, {
    videoId: "c",
    playlistId: undefined,
  });
  expect(usePlayerStore.getState().tracks.map((t) => t.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
  ]);
  expect(native.queue).toHaveLength(5);

  await rntp.__emit("event.media-item-transition", {
    item: native.queue[2],
    index: 2,
    reason: "auto",
  });
  await flush();
  expect(upNext).toHaveBeenNthCalledWith(2, {
    playlistId: "RDAMVMa",
    continuation: "k1",
  });
  expect(usePlayerStore.getState().tracks.map((t) => t.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
  ]);
});

test("a queue played with endless off stops at its end even when the setting is on", async () => {
  const upNext = jest.fn().mockResolvedValue({ tracks: tracks("z") });
  await setupPlayer({
    resolver: { resolve },
    catalog: { upNext },
    radioContinue: () => true,
  });
  await player.play(tracks("a", "b"), 0, { endless: false });
  await flush();
  expect(upNext).not.toHaveBeenCalled();

  await player.play(tracks("a", "b"), 0);
  await flush();
  expect(upNext).toHaveBeenCalledTimes(1);
});

test("the queue, index, position, shuffle and repeat survive a restart and restore without autoplay", async () => {
  const storage = memory();
  await setupPlayer({ resolver: { resolve }, storage });
  await player.play(tracks("a", "b", "c", "d"), 2);
  await flush();
  player.setRepeat("all");
  player.setShuffle(true);
  player.seekTo(61);
  await new Promise((r) => setTimeout(r, 1100));
  const saved = usePlayerStore.getState();

  __resetForTests();
  usePlayerStore.setState(initialState(), true);
  jest.clearAllMocks();
  await setupPlayer({ resolver: { resolve }, storage });
  expect(usePlayerStore.getState()).toMatchObject({
    tracks: saved.tracks,
    index: saved.index,
    shuffle: true,
    repeat: "all",
    status: "paused",
  });
  expect(JSON.parse(storage.data.get(POS_KEY)!).position).toBe(61);
  expect(tp.setMediaItems).not.toHaveBeenCalled();
  expect(tp.play).not.toHaveBeenCalled();

  player.resume();
  await flush();
  expect(tp.setMediaItems).toHaveBeenCalledWith(expect.any(Array), saved.index);
  expect(tp.seekTo).toHaveBeenCalledWith(61);
  expect(tp.play).toHaveBeenCalled();
  player.setShuffle(false);
  expect(usePlayerStore.getState().tracks.map((t) => t.id)).toEqual([
    "a",
    "b",
    "c",
    "d",
  ]);
});

test("artwork() feeds the native items and refreshArtwork updates only that track's metadata", async () => {
  const art = new Map<string, string>();
  await setupPlayer({ resolver: { resolve }, artwork: (t) => art.get(t.id) });
  art.set("a", "file:///a.jpg");
  await player.play(tracks("a", "b", "c", "b"));
  await flush();
  const items = tp.setMediaItems.mock.calls[0][0] as { artworkUrl?: string }[];
  expect(items[0].artworkUrl).toBe("file:///a.jpg");
  expect(items[1].artworkUrl).toBeUndefined();
  art.set("b", "file:///b.jpg");
  tp.replaceMediaItem.mockClear();
  refreshArtwork("b");
  expect(tp.updateMetadata.mock.calls).toEqual([
    [1, { artworkUrl: "file:///b.jpg" }],
    [3, { artworkUrl: "file:///b.jpg" }],
  ]);
  expect(tp.replaceMediaItem).not.toHaveBeenCalled();
});

test("setup turns on the disk cache with one song preloaded", async () => {
  await setupPlayer({ resolver: { resolve } });
  expect(tp.setupPlayer).toHaveBeenCalledWith(
    expect.objectContaining({
      cache: expect.objectContaining({ preloading: { window: 1 } }),
    }),
  );
});

test("songs keep a stable cache key, but a stream too big for the disk cache gets none", async () => {
  const long = jest.fn(async (t: Pick<Track, "id">) => ({
    ...(await resolve(t)),
    ...(t.id === "noise" ? { contentLength: 600 * 1024 * 1024 } : {}),
    ...(t.id === "raga" ? { durationSec: 40 * 60 } : {}),
  }));
  await setupPlayer({ resolver: { resolve: long } });
  await player.play(tracks("song", "noise", "raga"));
  await flush();
  await player.play(tracks("song", "noise", "raga"), 1);
  await flush();
  const keys = native.queue.map((it) => (it as { cacheKey?: string }).cacheKey);
  expect(keys).toEqual(["song:test:130000", undefined, undefined]);
});

test("a failed prefetch of a later song leaves the playing one without an error", async () => {
  const flaky = jest.fn(async (t: Pick<Track, "id">) => {
    if (t.id === "b") throw new Error("offline");
    return resolve(t);
  });
  await setupPlayer({ resolver: { resolve: flaky } });
  await player.play(tracks("a", "b"));
  await flush();
  expect(usePlayerStore.getState().error).toBeUndefined();
  expect(urlAt(1)).toMatch("pawse.invalid");
});

test("end of this song moves with a song you pick, and stops when playback moves on by itself", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c"));
  await flush();
  player.setSleepTimer("endOfTrack");
  expect(tp.sleepAfterMediaItemAtIndex).toHaveBeenLastCalledWith(0);

  player.next();
  await flush();
  expect(tp.sleepAfterMediaItemAtIndex).toHaveBeenLastCalledWith(1);
  expect(tp.pause).not.toHaveBeenCalled();

  const { keys } = usePlayerStore.getState();
  await rntp.__emit("event.media-item-transition", {
    item: { mediaId: keys[2] },
    reason: "auto",
  });
  expect(tp.pause).toHaveBeenCalled();
  expect(usePlayerStore.getState().sleepAt).toBeUndefined();
});

test("the sleep timer fades the volume itself, so the native timer only stops playback", async () => {
  await setupPlayer({ resolver: { resolve }, sleepFadeSec: () => 10 });
  await player.play(tracks("a"));
  await flush();
  jest.useFakeTimers();
  try {
    player.setSleepTimer(1);
    expect(tp.sleepAfterTime).toHaveBeenLastCalledWith(60, {
      fadeOutSeconds: 0,
    });
    expect(usePlayerStore.getState().sleepFading).toBe(false);
    jest.advanceTimersByTime(52_000);
    expect(usePlayerStore.getState().sleepFading).toBe(true);
    player.setSleepTimer(null);
    expect(usePlayerStore.getState().sleepFading).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});

const clientResolver = (clients: string[]) =>
  jest.fn(
    async (
      t: Pick<Track, "id">,
      o?: ResolveOptions,
    ): Promise<ResolvedStream> => {
      const left = clients.filter((c) => !o?.exclude?.includes(c));
      const avoid = o?.avoid ?? [];
      const via = [
        ...left.filter((c) => !avoid.includes(c)),
        ...avoid.filter((c) => left.includes(c)),
      ][0];
      if (!via) throw new Error("no client left");
      return {
        url: `https://a/${t.id}/${via}/${++version}`,
        mimeType: "audio/mp4",
        bitrate: 130_000,
        expiresAt: now + 6 * HOUR,
        via,
      };
    },
  );

test("a YouTube stream that stalls mid-song re-resolves at the same spot on the next client without demoting the first", async () => {
  const byClient = clientResolver(["youtube:a", "youtube:b"]);
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: byClient }, onDiagnostic: diag });
  await player.play(tracks("x", "y"));
  await flush();
  native.position = 62;
  await rntp.__emit("event.playback-error", {
    code: "stalled",
    message: "Playback stalled",
  });
  await flush();
  expect(urlAt(0)).toMatch("/x/youtube:b/");
  expect(tp.seekTo).toHaveBeenLastCalledWith(62);
  expect(urlAt(1)).toMatch("/y/youtube:a/");

  await player.play(tracks("y"));
  await rntp.__emit("event.playback-error", {
    code: "stalled",
    message: "Playback stalled",
  });
  await flush();
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
  await player.play(tracks("p"));
  expect(byClient.mock.calls.at(-1)?.[1]?.avoid).toBeUndefined();
});

test("a client refused on two songs stays last for 10 min", async () => {
  const byClient = clientResolver(["youtube:a", "youtube:b"]);
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: byClient }, onDiagnostic: diag });
  const refused = { code: "source", message: "Source error (HTTP 403)" };
  await player.play(tracks("x"));
  await flush();
  await rntp.__emit("event.playback-error", refused);
  await flush();
  await player.play(tracks("y"));
  await rntp.__emit("event.playback-error", refused);
  await flush();
  expect(diag).toHaveBeenCalledWith("source-avoided", "youtube:a");

  now += 9 * 60_000;
  await player.play(tracks("p"));
  expect(byClient.mock.calls.at(-1)?.[1]?.avoid).toEqual(["youtube:a"]);
  expect(urlAt(0)).toMatch("/p/youtube:b/");
  now += 2 * 60_000;
  await player.play(tracks("q"));
  expect(urlAt(0)).toMatch("/q/youtube:a/");
});

test("a long song slow to start moves to the next client without marking the first one down for other songs", async () => {
  const byClient = clientResolver(["youtube:a", "youtube:b"]);
  const long = jest.fn(async (t: Pick<Track, "id">, o?: ResolveOptions) => ({
    ...(await byClient(t, o)),
    durationSec: 3 * 3600,
  }));
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: long }, onDiagnostic: diag });
  for (const id of ["rain", "sitar"]) {
    await player.play(tracks(id));
    await flush();
    await rntp.__emit("event.playback-error", {
      code: "stalled",
      message: "Playback stalled",
    });
    await flush();
    expect(urlAt(0)).toMatch(`/${id}/youtube:b/`);
  }
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
});

test("three songs in a row that cannot resolve stop playback with the error instead of skipping the queue", async () => {
  const resting = jest.fn(async (): Promise<ResolvedStream> => {
    throw new Error("YouTube is resting after a bot check");
  });
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: resting }, onDiagnostic: diag });
  await player.play(tracks("a", "b", "c", "d", "e", "f"));
  await flush();
  expect(resting).toHaveBeenCalledTimes(3);
  expect(usePlayerStore.getState()).toMatchObject({
    status: "error",
    error: "YouTube is resting after a bot check",
  });
  expect(diag).toHaveBeenCalledWith("skip-guard", expect.any(String));

  // A skip you ask for looks through the rest of the queue (b to f).
  player.next();
  await flush();
  expect(resting).toHaveBeenCalledTimes(8);
});

test("three songs in a row that resolve but never start stop on the third", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c", "d", "e", "f"));
  await flush();
  const fail = { code: "source", message: "refused" };
  for (let n = 0; n < 6; n++) {
    await rntp.__emit("event.playback-error", fail);
    await flush();
  }
  expect(usePlayerStore.getState()).toMatchObject({
    index: 2,
    status: "error",
  });
  expect(tp.skipToIndex).not.toHaveBeenCalledWith(3);
  expect(tp.pause).toHaveBeenCalled();
});

test("resolved streams survive a restart, and one restored that fails is fetched again before its client is blamed", async () => {
  const storage = memory();
  const diag = jest.fn();
  const byClient = clientResolver(["youtube:a", "youtube:b"]);
  await setupPlayer({ resolver: { resolve: byClient }, storage });
  await player.play(tracks("a", "b", "c"));
  await flush();
  await new Promise((r) => setTimeout(r, 1100));
  const saved = JSON.parse(storage.data.get("pawse.streams")!);
  expect(saved.streams.map(([id]: [string]) => id)).toEqual(["a", "b", "c"]);

  __resetForTests();
  usePlayerStore.setState(initialState(), true);
  jest.clearAllMocks();
  await setupPlayer({
    resolver: { resolve: byClient },
    storage,
    onDiagnostic: diag,
  });
  player.resume();
  await flush();
  expect(byClient).not.toHaveBeenCalled();
  expect(urlAt(0)).toBe(saved.streams[0][1].url);

  await rntp.__emit("event.playback-error", { code: "source", message: "403" });
  await flush();
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
  expect(byClient.mock.calls.map(([t]) => t.id)).toEqual(["a"]);
  expect(urlAt(0)).toMatch("/a/youtube:a/");

  // Fresh URLs failing on two songs blame the client, and its streams are no longer saved.
  await rntp.__emit("event.playback-error", { code: "source", message: "403" });
  await flush();
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
  await player.play(tracks("d"));
  await flush();
  expect(urlAt(0)).toMatch("/d/youtube:a/");
  await rntp.__emit("event.playback-error", { code: "source", message: "403" });
  await flush();
  expect(diag).toHaveBeenCalledWith("source-avoided", "youtube:a");
  await new Promise((r) => setTimeout(r, 1100));
  const after = JSON.parse(storage.data.get("pawse.streams")!);
  expect(
    after.streams.every(
      ([, st]: [string, ResolvedStream]) => st.via !== "youtube:a",
    ),
  ).toBe(true);
  expect(after.avoid[0][0]).toBe("youtube:a");
});

test("a pause while the next song loads is not logged as a system pause", async () => {
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve }, onDiagnostic: diag });
  await player.play(tracks("a", "b"));
  await flush();
  await rntp.__emit("event.playback-state-changed", { state: "buffering" });
  await rntp.__emit("event.is-playing-changed", { playing: false });
  expect(diag).not.toHaveBeenCalledWith("paused-by-system", expect.anything());

  now += 60_000;
  await rntp.__emit("event.playback-state-changed", { state: "ready" });
  await rntp.__emit("event.is-playing-changed", { playing: false });
  expect(diag).toHaveBeenCalledWith("paused-by-system", "ready");
});

test("a song still playing past its length moves on to the next", async () => {
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve }, onDiagnostic: diag });
  await player.play(tracks("a", "b"));
  await flush();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  native.position = 202;
  // The check runs on the five-second progress tick.
  await new Promise((r) => setTimeout(r, 6000));
  await flush();
  expect(diag).toHaveBeenCalledWith("duration-guard", "a 200s");
  expect(tp.skipToIndex).toHaveBeenCalledWith(1);
}, 12_000);

test("a song that stops on its last second without ending moves on to the next", async () => {
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve }, onDiagnostic: diag });
  await player.play(tracks("a", "b"));
  await flush();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  now += 60_000;
  native.position = 199.5;
  await rntp.__emit("event.playback-state-changed", { state: "ready" });
  await rntp.__emit("event.is-playing-changed", { playing: false });
  await new Promise((r) => setTimeout(r, 1600));
  await flush();
  expect(diag).toHaveBeenCalledWith("stopped-at-end", "a at 200s");
  expect(tp.skipToIndex).toHaveBeenCalledWith(1);
});

test("on iOS an HE-AAC song saved with the doubled length plays to its real length", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  resolve.mockImplementationOnce(async (t) => ({
    url: `https://a/${t.id}/he`,
    mimeType: 'audio/mp4; codecs="mp4a.40.5"',
    bitrate: 50_000,
    expiresAt: now + 6 * HOUR,
    via: "local",
  }));
  await setupPlayer({ resolver: { resolve } });
  // The native player reports 200 s; history saved that misread as the song's length.
  await player.play([{ ...track("a"), durationSec: 200 }, track("b")]);
  await flush();
  expect(getProgress().duration).toBe(100);
});

test("a skip you ask for looks past songs that can't play, and the old song carries on when none can", async () => {
  const dead = new Set(["b", "c", "d"]);
  resolve.mockImplementation(async (t) => {
    if (dead.has(t.id)) throw new Error("YouTube is resting after a bot check");
    return {
      url: `https://a/${t.id}/${++version}`,
      mimeType: 'audio/mp4; codecs="mp4a.40.2"',
      bitrate: 130_000,
      expiresAt: now + 6 * HOUR,
      via: "test",
    };
  });
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b", "c", "d", "e"));
  await flush();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  const fadeOut = () => new Promise((r) => setTimeout(r, 1200));
  player.next();
  await fadeOut();
  await flush();
  expect(usePlayerStore.getState().index).toBe(4);
  expect(tp.skipToIndex).toHaveBeenLastCalledWith(4);

  // Previous looks backwards past d, c and b; a still has its link from earlier, so it plays.
  player.previous();
  await fadeOut();
  await flush();
  expect(usePlayerStore.getState().index).toBe(0);

  // A fresh queue where nothing after x can play: x carries on.
  dead.add("y").add("z");
  await player.play(tracks("x", "y", "z"));
  await flush();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  tp.play.mockClear();
  player.next();
  await fadeOut();
  await flush();
  expect(usePlayerStore.getState().index).toBe(0);
  expect(tp.play).toHaveBeenCalled();
});

test("a long song with a playlist plays from it, outside the cache; a player that can't open it plays the song direct from then on", async () => {
  const byClient = clientResolver(["youtube:a", "youtube:b"]);
  const long = jest.fn(async (t: Pick<Track, "id">, o?: ResolveOptions) => ({
    ...(await byClient(t, o)),
    contentLength: 90 * 1024 * 1024,
    playlist: `file:///cache/hls/${t.id}.m3u8`,
  }));
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: long }, onDiagnostic: diag });
  await player.play(tracks("rain", "sea"));
  await flush();
  const item = native.queue[0] as { mimeType?: string; cacheKey?: string };
  expect(urlAt(0)).toBe("file:///cache/hls/rain.m3u8");
  expect(item.mimeType).toBe("application/x-mpegURL");
  expect(item.cacheKey).toBeUndefined();
  await rntp.__emit("event.playback-error", {
    code: "source",
    message: "Cannot open",
  });
  await flush();
  expect(urlAt(0)).toMatch("/rain/youtube:a/");
  expect(diag).toHaveBeenCalledWith("playlist-off", expect.anything());
  // The source wasn't to blame, and the next song skips its playlist too.
  expect(long).toHaveBeenCalledTimes(2);
  await player.next();
  await flush();
  expect(urlAt(1)).toMatch("/sea/youtube:a/");
});

test("a song's non-music part is skipped when playback reaches it, and one that runs to the end ends the song", async () => {
  jest.useFakeTimers({ doNotFake: ["Date"] });
  const onSkip = jest.fn();
  const skipSegments = jest.fn(async () => [
    { start: 0, end: 12, category: "music_offtopic" },
    { start: 190, end: 200, category: "music_offtopic" },
  ]);
  await setupPlayer({ resolver: { resolve }, skipSegments, onSkip });
  await player.play(tracks("mv"));
  await jest.runOnlyPendingTimersAsync();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  expect(tp.seekTo).toHaveBeenLastCalledWith(12);
  expect(onSkip).toHaveBeenCalledWith(
    expect.objectContaining({ id: "mv" }),
    "music_offtopic",
  );
  native.position = 150;
  await jest.advanceTimersByTimeAsync(1000);
  expect(tp.seekTo).toHaveBeenLastCalledWith(12);
  native.position = 189.9;
  await jest.advanceTimersByTimeAsync(41_000);
  expect(tp.seekTo).toHaveBeenLastCalledWith(expect.closeTo(200 - 0.3, 1));
  jest.useRealTimers();
});

test("crossfade leaves songs from one album alone", async () => {
  jest.useFakeTimers({ doNotFake: ["Date"] });
  const onAlbum = (id: string, album: string): Track => ({
    ...track(id),
    album: { id: album, title: album },
  });
  await setupPlayer({ resolver: { resolve }, crossfadeSec: () => 6 });
  await player.play([onAlbum("a", "x"), onAlbum("b", "x")]);
  await jest.runOnlyPendingTimersAsync();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  native.position = 190;
  await jest.advanceTimersByTimeAsync(5000);
  native.position = 194;
  await jest.advanceTimersByTimeAsync(10_200);
  expect(tp.setVolume).not.toHaveBeenCalledWith(0);
  jest.useRealTimers();
});

test("crossfade fades a song out over its last seconds and brings the next one in", async () => {
  jest.useFakeTimers({ doNotFake: ["Date"] });
  await setupPlayer({ resolver: { resolve }, crossfadeSec: () => 6 });
  await player.play(tracks("a", "b"));
  await jest.runOnlyPendingTimersAsync();
  await rntp.__emit("event.is-playing-changed", { playing: true });
  native.position = 190; // the mock's songs run 200 s
  await jest.advanceTimersByTimeAsync(5000); // a tick arms the fade for 194 s
  native.position = 194;
  await jest.advanceTimersByTimeAsync(4100); // the fade starts at 194 s
  expect(tp.setVolume).not.toHaveBeenLastCalledWith(1);
  await jest.advanceTimersByTimeAsync(6100); // and reaches silence by the end
  expect(tp.setVolume).toHaveBeenLastCalledWith(0);
  await rntp.__emit("event.media-item-transition", {
    item: { mediaId: usePlayerStore.getState().keys[1] },
    reason: "auto",
  });
  await jest.advanceTimersByTimeAsync(3100);
  expect(tp.setVolume).toHaveBeenLastCalledWith(1);
  jest.useRealTimers();
});

const repackaged = (id: string): ResolvedStream => ({
  url: `file:///cache/${id}.m4a`,
  mimeType: 'audio/mp4; codecs="opus"',
  bitrate: 160_000,
  expiresAt: Date.UTC(2100, 0, 1),
  via: "remux:opus",
});

test("upcoming songs get an upgraded stream once, the playing song never", async () => {
  const upgrade = jest.fn(async (t: Track) => repackaged(t.id));
  await setupPlayer({ resolver: { resolve }, upgrade });
  await player.play(tracks("a", "b", "c", "d"));
  await flush();
  expect(upgrade.mock.calls.map(([t]) => t.id).sort()).toEqual(["b", "c"]);
  expect(urlAt(0)).toMatch("https://a/a/");
  expect(urlAt(1)).toBe("file:///cache/b.m4a");
  expect(urlAt(2)).toBe("file:///cache/c.m4a");
  player.next();
  await flush();
  expect(upgrade.mock.calls.map(([t]) => t.id).sort()).toEqual(["b", "c", "d"]);
});

test("an upgrade that finishes after its song started is dropped", async () => {
  let done: (st: ResolvedStream | undefined) => void = () => {};
  const upgrade = jest.fn(
    (t: Track) =>
      new Promise<ResolvedStream | undefined>((r) => {
        if (t.id === "b") done = r as typeof done;
        else r(undefined);
      }),
  );
  await setupPlayer({ resolver: { resolve }, upgrade });
  await player.play(tracks("a", "b", "c"));
  await flush();
  player.next();
  await flush();
  tp.replaceMediaItem.mockClear();
  done(repackaged("b"));
  await flush();
  expect(tp.replaceMediaItem).not.toHaveBeenCalled();
  expect(urlAt(1)).toMatch("https://a/b/");
});

test("restream swaps the playing song's stream and resumes at the same spot", async () => {
  await setupPlayer({ resolver: { resolve } });
  await player.play(tracks("a", "b"));
  await flush();
  native.position = 42;
  await restream(async (t) => repackaged(t.id));
  expect(urlAt(0)).toBe("file:///cache/a.m4a");
  expect(tp.seekTo).toHaveBeenLastCalledWith(42);
  await expect(
    restream(async () => {
      throw new Error("not available");
    }),
  ).rejects.toThrow("not available");
  expect(urlAt(0)).toBe("file:///cache/a.m4a");
});
