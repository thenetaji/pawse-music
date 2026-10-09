import type { ResolvedStream, Track } from "@pawse/music-core";
import { createStore } from "zustand/vanilla";

import {
  CHUNK,
  cacheScore,
  createDownloadManager,
  type DownloadDeps,
  type IndexState,
  type LiveState,
  pickEvictions,
  playStats,
  type RangeResult,
} from "./downloads-core";

const track = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [],
  thumbnails: [],
});
const stream = (len: number, url = "u1"): ResolvedStream => ({
  url,
  mimeType: "audio/mp4",
  bitrate: 1,
  contentLength: len,
  expiresAt: 0,
  via: "test",
});
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

function setup(len = CHUNK * 2 + 10, overrides: Partial<DownloadDeps> = {}) {
  const parts = new Map<string, number>();
  const finished: string[] = [];
  const removed: string[] = [];
  const ranges: string[] = [];
  const deps: DownloadDeps = {
    resolve: jest.fn(async () => stream(len)),
    fetchRange: jest.fn(async (url, _h, start, end): Promise<RangeResult> => {
      ranges.push(`${url}:${start}-${end}`);
      return {
        status: 206,
        bytes: new Uint8Array(end - start + 1),
        total: len,
      };
    }),
    partSize: (id) => parts.get(id) ?? 0,
    append: (id, b) => parts.set(id, (parts.get(id) ?? 0) + b.length),
    discardPart: (id) => parts.delete(id),
    finish: (id, ext) => (finished.push(id), `${id}.${ext}`),
    saveArt: async (id) => `${id}.jpg`,
    removeFiles: (e) => (removed.push(e.id), parts.delete(e.id)),
    canDownload: async () => true,
    sleep: async () => {},
    ...overrides,
  };
  const index = createStore<IndexState>(() => ({ entries: {} }));
  const live = createStore<LiveState>(() => ({ progress: {} }));
  const m = createDownloadManager(index, live, deps);
  return { m, index, deps, parts, finished, removed, ranges };
}

describe("download manager", () => {
  it("downloads in 1 MiB ranges and marks the entry done", async () => {
    const t = setup();
    t.m.download(track("a"));
    await flush();
    expect(t.ranges).toEqual([
      `u1:0-${CHUNK - 1}`,
      `u1:${CHUNK}-${2 * CHUNK - 1}`,
      `u1:${2 * CHUNK}-${2 * CHUNK + 9}`,
    ]);
    expect(t.index.getState().entries.a).toMatchObject({
      state: "done",
      file: "a.m4a",
      art: "a.jpg",
      bytes: CHUNK * 2 + 10,
    });
  });

  it("runs two at a time", async () => {
    const gates: (() => void)[] = [];
    const t = setup(10, {
      fetchRange: jest.fn(
        (_u, _h, start, end) =>
          new Promise<RangeResult>((resolve) =>
            gates.push(() =>
              resolve({
                status: 206,
                bytes: new Uint8Array(end - start + 1),
              }),
            ),
          ),
      ),
    });
    t.m.downloadMany([track("a"), track("b"), track("c")]);
    await flush();
    const states = () =>
      Object.values(t.index.getState().entries).map((e) => e.state);
    expect(states()).toEqual(["downloading", "downloading", "queued"]);
    gates.splice(0).forEach((g) => g());
    await flush();
    expect(t.index.getState().entries.c.state).toBe("downloading");
    gates.splice(0).forEach((g) => g());
    await flush();
    expect(states()).toEqual(["done", "done", "done"]);
  });

  it("resumes from the partial file and re-resolves on 403", async () => {
    let first = true;
    const t = setup(CHUNK + 5, {
      fetchRange: jest.fn(async (url, _h, start, end) => {
        if (first) {
          first = false;
          return { status: 403, bytes: new Uint8Array(0) };
        }
        return { status: 206, bytes: new Uint8Array(end - start + 1) };
      }),
    });
    t.parts.set("a", CHUNK);
    t.m.download(track("a"));
    await flush();
    expect(t.deps.resolve).toHaveBeenCalledTimes(2);
    expect(t.deps.fetchRange).toHaveBeenLastCalledWith(
      "u1",
      undefined,
      CHUNK,
      CHUNK + 4,
    );
    expect(t.index.getState().entries.a.state).toBe("done");
  });

  it("holds the queue on mobile data when Wi-Fi only, and fails after retries", async () => {
    let gate: true | "wifi" = "wifi";
    const t = setup(10, { canDownload: async () => gate });
    t.m.download(track("a"));
    await flush();
    expect(t.index.getState().entries.a).toMatchObject({
      state: "queued",
      waiting: "wifi",
    });
    gate = true;
    (t.deps.fetchRange as jest.Mock).mockRejectedValue(new Error("offline"));
    await t.m.pump();
    await flush();
    expect(t.index.getState().entries.a).toMatchObject({
      state: "error",
      error: "offline",
      waiting: undefined,
    });
  });

  it("removing an active download cancels it and deletes its files", async () => {
    let release!: () => void;
    const t = setup(10, {
      fetchRange: jest.fn(
        (_u, _h, start, end) =>
          new Promise<RangeResult>((resolve) => {
            release = () =>
              resolve({
                status: 206,
                bytes: new Uint8Array(end - start + 1),
              });
          }),
      ),
    });
    t.m.download(track("a"));
    await flush();
    t.m.remove("a");
    expect(t.index.getState().entries.a).toBeUndefined();
    release();
    await flush();
    expect(t.finished).toEqual([]);
    expect(t.removed).toEqual(["a"]);
  });
});

describe("cache eviction", () => {
  const DAY = 86400_000;
  const now = Date.UTC(2026, 9, 8);
  const item = (id: string, at: number, bytes = 10) => ({ id, bytes, at });

  it("keeps often played songs over a newer one-off and evicts stale songs first", () => {
    const stats = playStats([
      { track: { id: "new" }, at: now - DAY },
      ...Array.from({ length: 5 }, (_, k) => ({
        track: { id: "fav" },
        at: now - 7 * DAY - k,
      })),
      { track: { id: "old" }, at: now - 60 * DAY },
    ]);
    const items = [
      item("fav", now - 30 * DAY),
      item("new", now - DAY),
      item("old", now - 60 * DAY),
    ];
    expect(cacheScore(items[0], stats.get("fav"), now)).toBeGreaterThan(
      cacheScore(items[1], stats.get("new"), now),
    );
    expect(pickEvictions(items, stats, 30, now)).toEqual([]);
    expect(pickEvictions(items, stats, 20, now)).toEqual(["old"]);
    expect(pickEvictions(items, stats, 10, now)).toEqual(["old", "new"]);
  });
});
