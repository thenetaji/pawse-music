import TrackPlayer from "@rntp/player";
import type { ResolvedStream, Track } from "@studio/music-core";

import { __resetForTests, player, POS_KEY, setupPlayer } from "./engine";
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
const resolve = jest.fn(
  async (t: Pick<Track, "id">): Promise<ResolvedStream> => ({
    url: `https://a/${t.id}/${++version}`,
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    bitrate: 130_000,
    expiresAt: now + 6 * HOUR,
    via: "test",
  }),
);
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
  expect(urlAt(4)).toMatch("flow.invalid");
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
