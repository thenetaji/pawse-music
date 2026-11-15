import type { Track } from "@pawse/music-core";

import { orderTracks } from "./view-order";

const song = (id: string, title: string) =>
  ({ id, title, source: "youtube", artists: [], thumbnails: [] }) as Track;
const list = [song("a", "Zero"), song("b", "apple"), song("c", "Mango")];

describe("orderTracks", () => {
  it("keeps the playlist order for oldest first and when nothing is chosen", () => {
    expect(orderTracks(list, "oldest").tracks).toBe(list);
    expect(orderTracks(list, undefined).from).toEqual([0, 1, 2]);
  });

  it("reverses it for newest first", () => {
    const r = orderTracks(list, "newest");
    expect(r.tracks.map((t) => t.id)).toEqual(["c", "b", "a"]);
    expect(r.from).toEqual([2, 1, 0]);
  });

  it("sorts titles ignoring case, in both directions, and says where each came from", () => {
    const az = orderTracks(list, "az");
    expect(az.tracks.map((t) => t.title)).toEqual(["apple", "Mango", "Zero"]);
    expect(az.from).toEqual([1, 2, 0]);
    expect(orderTracks(list, "za").tracks.map((t) => t.title)).toEqual([
      "Zero",
      "Mango",
      "apple",
    ]);
  });

  it("keeps equal titles in playlist order", () => {
    const twins = [song("x", "Same"), song("y", "same")];
    expect(orderTracks(twins, "az").from).toEqual([0, 1]);
    expect(orderTracks(twins, "za").from).toEqual([0, 1]);
  });
});
