import type { ResolvedStream, ResolveOptions, Track } from "@pawse/music-core";
import { AppState } from "react-native";

import { __resetForTests, player, setupPlayer } from "./engine";
import { initialState, usePlayerStore } from "./store";
import type { LoadIssue } from "./types";

type MockListener = (payload: unknown) => unknown;

jest.mock("@rntp/player", () => {
  const listeners = new Map<string, MockListener>();
  const native = {
    queue: [] as { mediaId: string; url: unknown }[],
    position: 0,
    duration: 0,
    buffered: 0,
    cached: 0,
  };
  const api = {
    setupPlayer: jest.fn(),
    setCommands: jest.fn(),
    registerRemoteHandlers: jest.fn(() => ({ remove() {} })),
    addEventListener: jest.fn((e: string, cb: MockListener) => {
      listeners.set(e, cb);
      return { remove() {} };
    }),
    setMediaItems: jest.fn((items: { mediaId: string; url: unknown }[]) => {
      native.queue = [...items];
      native.position = 0;
    }),
    addMediaItems: jest.fn(),
    insertMediaItem: jest.fn(),
    insertMediaItems: jest.fn(),
    removeMediaItem: jest.fn(),
    removeMediaItems: jest.fn(),
    moveMediaItem: jest.fn(),
    updateMetadata: jest.fn(),
    replaceMediaItem: jest.fn(
      (i: number, item: { mediaId: string; url: unknown }) =>
        (native.queue[i] = item),
    ),
    skipToIndex: jest.fn(() => (native.position = 0)),
    seekTo: jest.fn((p: number) => (native.position = p)),
    getProgress: () => ({
      position: native.position,
      duration: native.duration,
      buffered: native.buffered,
      cached: native.cached,
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
  __native: {
    queue: { mediaId: string; url: unknown }[];
    position: number;
    duration: number;
    buffered: number;
    cached: number;
  };
  __emit: (e: string, p: unknown) => Promise<void> | void;
};
const native = rntp.__native;

const HOUR = 3_600_000;
const track = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: "A" }],
  thumbnails: [],
});
const tracks = (...ids: string[]) => ids.map(track);

let now = Date.UTC(2026, 9, 28);
let version = 0;
const urlAt = (i: number) => {
  const u = native.queue[i]?.url;
  return typeof u === "string" ? u : (u as { uri: string }).uri;
};

const resolver = (clients: string[]) =>
  jest.fn(
    async (
      t: Pick<Track, "id">,
      o?: ResolveOptions,
    ): Promise<ResolvedStream> => {
      const left = clients.filter((c) => !o?.exclude?.includes(c));
      const avoid = o?.avoid ?? [];
      const via = o?.skipYouTube
        ? "saavn"
        : [
            ...left.filter((c) => !avoid.includes(c)),
            ...avoid.filter((c) => left.includes(c)),
          ][0];
      if (!via) throw new Error("no client left");
      return {
        url: `https://a/${t.id}/${via}/${++version}`,
        mimeType: "audio/mp4",
        bitrate: 128_000,
        expiresAt: now + 6 * HOUR,
        via,
      };
    },
  );

const secs = async (n: number) => {
  for (let i = 0; i < n; i++) await jest.advanceTimersByTimeAsync(1000);
};
const buffering = () =>
  rntp.__emit("event.playback-state-changed", { state: "buffering" });
const start = async (...ids: string[]) => {
  await player.play(tracks(...ids));
  await jest.advanceTimersByTimeAsync(0);
  await buffering();
};
const state = () => usePlayerStore.getState();
const appIs = (s: "active" | "background") =>
  Object.assign(AppState, { currentState: s });

beforeEach(() => {
  jest.useFakeTimers();
  appIs("active");
  __resetForTests();
  usePlayerStore.setState(initialState(), true);
  jest.clearAllMocks();
  Object.assign(native, {
    queue: [],
    position: 0,
    duration: 0,
    buffered: 0,
    cached: 0,
  });
  now = Date.UTC(2026, 9, 28);
  jest.spyOn(Date, "now").mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("a source that sends nothing fails over in about 6 s", async () => {
  const diag = jest.fn();
  await setupPlayer({
    resolver: { resolve: resolver(["youtube:a", "youtube:b"]) },
    onDiagnostic: diag,
  });
  await start("x", "y");
  await secs(5);
  expect(urlAt(0)).toMatch("/x/youtube:a/");
  await secs(1);
  expect(urlAt(0)).toMatch("/x/youtube:b/");
  expect(diag).toHaveBeenCalledWith(
    "error",
    expect.stringMatching(
      /^stalled: Playback stalled after \d+ s \(no data\) via=youtube:a$/,
    ),
  );
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
});

test("a slow but working connection is waited on, with a notice, until the 20 s budget runs out", async () => {
  const issues: LoadIssue[] = [];
  const byClient = resolver(["youtube:a", "youtube:b"]);
  await setupPlayer({
    resolver: { resolve: byClient },
    onLoadIssue: (i) => issues.push(i),
  });
  await start("x", "y");
  native.duration = 200;
  for (let i = 0; i < 19; i++) {
    native.cached += 0.5;
    await secs(1);
  }
  expect(urlAt(0)).toMatch("/x/youtube:a/");
  expect(issues.map((i) => i.kind)).toEqual(["weak"]);
  expect(byClient).toHaveBeenCalledTimes(2);

  native.cached += 0.5;
  await secs(1);
  expect(issues.map((i) => i.kind)).toEqual(["weak", "gave-up"]);
  expect(issues[1]).toMatchObject({ reason: "slow", track: { id: "x" } });
  expect(state()).toMatchObject({
    index: 1,
    failed: { x: "slow" },
    tracks: [{ id: "x" }, { id: "y" }],
  });
});

test("time spent in the background does not count against the source", async () => {
  const diag = jest.fn();
  await setupPlayer({
    resolver: { resolve: resolver(["youtube:a", "youtube:b"]) },
    onDiagnostic: diag,
  });
  await start("x", "y");
  appIs("background");
  await secs(40);
  expect(urlAt(0)).toMatch("/x/youtube:a/");
  expect(diag).not.toHaveBeenCalledWith("error", expect.anything());

  appIs("active");
  await secs(6);
  expect(urlAt(0)).toMatch("/x/youtube:b/");
});

test("a refusal found by the probe fails over to the client prepared meanwhile, and two refused songs demote it", async () => {
  const byClient = resolver(["youtube:a", "youtube:b"]);
  const probe = jest.fn(async (st: ResolvedStream) =>
    st.via === "youtube:a" ? ("refused" as const) : ("ok" as const),
  );
  const diag = jest.fn();
  await setupPlayer({
    resolver: { resolve: byClient },
    probe,
    onDiagnostic: diag,
  });
  await start("x", "y");
  await secs(2);
  expect(byClient).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "x" }),
    expect.objectContaining({ exclude: ["youtube:a"] }),
  );
  const resolvesBefore = byClient.mock.calls.length;
  await secs(1);
  expect(urlAt(0)).toMatch("/x/youtube:b/");
  expect(byClient).toHaveBeenCalledTimes(resolvesBefore);

  await start("p");
  await secs(5);
  expect(urlAt(0)).toMatch("/p/youtube:b/");
  expect(diag).toHaveBeenCalledWith("source-avoided", "youtube:a");
});

test("when the next client answers and this one does not, it takes over after 3 s", async () => {
  const probe = jest.fn(async (st: ResolvedStream) =>
    st.via === "youtube:a" ? new Promise<"ok">(() => {}) : ("ok" as const),
  );
  await setupPlayer({
    resolver: { resolve: resolver(["youtube:a", "youtube:b"]) },
    probe,
  });
  await start("x", "y");
  await secs(2);
  expect(urlAt(0)).toMatch("/x/youtube:a/");
  await secs(1);
  expect(urlAt(0)).toMatch("/x/youtube:b/");
});

test("a phone that cannot reach the server stays on its source instead of trying every client", async () => {
  const byClient = resolver(["youtube:a", "youtube:b", "youtube:c"]);
  const issues: LoadIssue[] = [];
  await setupPlayer({
    resolver: { resolve: byClient },
    probe: async () => "unreachable",
    onLoadIssue: (i) => issues.push(i),
  });
  await start("x", "y");
  await secs(19);
  expect(urlAt(0)).toMatch("/x/youtube:a/");
  expect(issues.map((i) => i.kind)).toEqual(["weak"]);
  await secs(1);
  expect(issues[1]).toMatchObject({ kind: "gave-up", reason: "slow" });
});

test("two silent clients are followed by JioSaavn inside the same budget, and nobody is demoted for silence alone", async () => {
  const byClient = resolver(["youtube:a", "youtube:b", "youtube:c"]);
  const issues: LoadIssue[] = [];
  const diag = jest.fn();
  await setupPlayer({
    resolver: { resolve: byClient },
    onLoadIssue: (i) => issues.push(i),
    onDiagnostic: diag,
  });
  await start("x", "y");
  await secs(6);
  expect(urlAt(0)).toMatch("/x/youtube:b/");
  await secs(6);
  expect(byClient).toHaveBeenLastCalledWith(
    expect.objectContaining({ id: "x" }),
    expect.objectContaining({ skipYouTube: true }),
  );
  expect(urlAt(0)).toMatch("/x/saavn/");
  await secs(8);
  expect(issues).toMatchObject([{ kind: "gave-up", reason: "slow" }]);
  expect(state().index).toBe(1);
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
});

test("a client that sent nothing is blamed once the next one delivers", async () => {
  const byClient = resolver(["youtube:a", "youtube:b"]);
  const diag = jest.fn();
  await setupPlayer({ resolver: { resolve: byClient }, onDiagnostic: diag });
  for (const id of ["x", "y"]) {
    native.duration = 0;
    await start(id);
    await secs(6);
    expect(urlAt(0)).toMatch(`/${id}/youtube:b/`);
    native.duration = 200;
    await secs(1);
  }
  expect(diag).toHaveBeenCalledWith("source-avoided", "youtube:a");
});

test("how fast the song arrives is reported while it loads", async () => {
  const speeds: number[] = [];
  await setupPlayer({
    resolver: { resolve: resolver(["youtube:a"]) },
    onThroughput: (k) => speeds.push(k),
  });
  await start("x");
  native.duration = 200;
  await secs(1);
  native.cached = 2;
  await secs(1);
  expect(speeds).toEqual([256]);
});

test("a client that plays a song through is forgiven its earlier refusal", async () => {
  const diag = jest.fn();
  await setupPlayer({
    resolver: { resolve: resolver(["youtube:a", "youtube:b"]) },
    onDiagnostic: diag,
  });
  const refused = { code: "source", message: "Source error (HTTP 403)" };
  await player.play(tracks("x"));
  await jest.advanceTimersByTimeAsync(0);
  await rntp.__emit("event.playback-error", refused);
  await jest.advanceTimersByTimeAsync(0);

  await player.play(tracks("y"));
  await jest.advanceTimersByTimeAsync(0);
  expect(urlAt(0)).toMatch("/y/youtube:a/");
  await rntp.__emit("event.is-playing-changed", { playing: true });
  native.position = 12;
  await secs(5);
  await rntp.__emit("event.is-playing-changed", { playing: false });

  await player.play(tracks("z"));
  await jest.advanceTimersByTimeAsync(0);
  await rntp.__emit("event.playback-error", refused);
  await jest.advanceTimersByTimeAsync(0);
  expect(diag).not.toHaveBeenCalledWith("source-avoided", expect.anything());
});
