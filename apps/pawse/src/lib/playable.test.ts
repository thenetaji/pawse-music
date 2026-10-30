import type { VideoItem } from "@pawse/music-core";

import { playable } from "./playable";

const video = (o: Partial<VideoItem>): VideoItem => ({
  type: "video",
  id: "aaaaaaaaaaa",
  title: "A video",
  durationSec: 300,
  thumbnails: [],
  ...o,
});

describe("playable", () => {
  it("keeps a normal video and a live stream", () => {
    expect(playable(video({}))).toBe(true);
    expect(playable(video({ durationSec: undefined, live: true }))).toBe(true);
  });

  it("drops private and deleted videos", () => {
    expect(playable(video({ title: "[Private video]" }))).toBe(false);
    expect(playable(video({ title: "[Deleted video]" }))).toBe(false);
  });

  it("drops premieres that haven't started and videos with no length", () => {
    expect(playable(video({ publishedText: "Premieres in 2 hours" }))).toBe(
      false,
    );
    expect(playable(video({ durationSec: undefined }))).toBe(false);
  });
});
