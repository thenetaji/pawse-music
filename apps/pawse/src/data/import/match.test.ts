import type { Track } from "@pawse/music-core";

import { yt } from "../clients";
import { matchTracks } from "./match";

jest.mock("../clients", () => ({
  yt: { search: jest.fn(), upNext: jest.fn() },
}));

const search = yt.search as jest.Mock;
const upNext = yt.upNext as jest.Mock;

const track = (
  id: string,
  title: string,
  artist: string,
  durationSec?: number,
): Track => ({
  id,
  source: "youtube",
  title,
  artists: [{ name: artist }],
  durationSec,
  thumbnails: [{ url: `https://i/${id}`, width: 1, height: 1 }],
});
const songs = (...tracks: Track[]) => ({
  shelves: [],
  items: tracks.map((t) => ({ type: "track", ...t })),
});

beforeEach(() => {
  search.mockReset();
  upNext.mockReset();
});

it("sorts results into matched, unsure and missing in input order", async () => {
  search.mockImplementation(async (q: string) => {
    if (q === "Yellow Coldplay")
      return songs(
        track("live", "Yellow (Live)", "Coldplay"),
        track("yel", "Yellow", "Coldplay"),
      );
    if (q === "Clocks") return songs(track("clk", "Clocks", "Coldplay"));
    if (q === "Nope Nobody")
      return songs(track("zz", "Something else", "Other"));
    throw new Error("network");
  });
  const progress: number[] = [];
  const out = await matchTracks(
    [
      { title: "Yellow", artist: "Coldplay" },
      { title: "Clocks" },
      { title: "Nope", artist: "Nobody" },
      { title: "Broken", artist: "Net" },
      { title: "yellow ", artist: "coldplay" },
    ],
    (done) => progress.push(done),
  );
  expect(out.map((r) => r.status)).toEqual([
    "matched",
    "unsure",
    "missing",
    "missing",
    "matched",
  ]);
  expect(out[0].track?.id).toBe("yel");
  expect(out[0].candidates.map((t) => t.id)).toEqual(["yel", "live"]);
  expect(out[0].track).not.toHaveProperty("type");
  expect(out[1].candidates.map((t) => t.id)).toEqual(["clk"]);
  expect(out[2].candidates).toEqual([]);
  expect(out[3].candidates).toEqual([]);
  // The repeated song reuses the first lookup.
  expect(search).toHaveBeenCalledTimes(4);
  expect(search).toHaveBeenCalledWith("Yellow Coldplay", "songs");
  expect(progress).toEqual([1, 2, 3, 4, 5]);
});

it("builds video id items from YouTube Music, or trusts the id", async () => {
  upNext.mockImplementation(async ({ videoId }: { videoId: string }) => {
    if (videoId === "dQw4w9WgXcQ")
      return {
        tracks: [
          {
            ...track("dQw4w9WgXcQ", "Never Gonna Give You Up", "Rick Astley"),
            setVideoId: "s",
          },
          track("other", "Other", "X"),
        ],
      };
    throw new Error("network");
  });
  const out = await matchTracks([
    { title: "", videoId: "dQw4w9WgXcQ" },
    { title: "Mine", artist: "Me", videoId: "abcdefghijk" },
  ]);
  expect(out[0]).toMatchObject({
    status: "matched",
    track: {
      id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up",
      setVideoId: undefined,
    },
  });
  expect(out[1]).toMatchObject({
    status: "matched",
    track: {
      id: "abcdefghijk",
      title: "Mine",
      artists: [{ name: "Me" }],
      thumbnails: [],
    },
  });
  expect(search).not.toHaveBeenCalled();
});

it("rejects with an AbortError as soon as the signal aborts", async () => {
  search.mockImplementation(() => new Promise(() => {}));
  const ctrl = new AbortController();
  const run = matchTracks(
    Array.from({ length: 10 }, (_, i) => ({ title: `Song ${i}` })),
    undefined,
    ctrl.signal,
  );
  setTimeout(() => ctrl.abort(), 20);
  await expect(run).rejects.toMatchObject({ name: "AbortError" });
  expect(search.mock.calls.length).toBeLessThanOrEqual(1);
});
