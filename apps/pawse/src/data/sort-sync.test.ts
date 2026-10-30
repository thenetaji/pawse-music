import type { Track } from "@pawse/music-core";

import { advanceSeen, planPlaylist, sourceChanges } from "./sort-sync";

const t = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: "A" }],
  thumbnails: [],
});
const ids = (ts: Track[]) => ts.map((x) => x.id);

describe("sourceChanges", () => {
  it("finds songs that arrived and songs that left", () => {
    const { fresh, gone } = sourceChanges(
      [t("a"), t("c"), t("d")],
      ["a", "b", "c"],
    );
    expect(ids(fresh)).toEqual(["d"]);
    expect([...gone]).toEqual(["b"]);
  });

  it("sees nothing when the source is as it was", () => {
    const { fresh, gone } = sourceChanges([t("a"), t("b")], ["b", "a"]);
    expect(fresh).toEqual([]);
    expect(gone.size).toBe(0);
  });
});

describe("planPlaylist", () => {
  const belongs = (x: Track) => x.id.startsWith("m");

  it("adds new songs that belong and removes songs that left the source", () => {
    const plan = planPlaylist({
      fresh: [t("m1"), t("x1"), t("m2")],
      gone: new Set(["m0", "x0"]),
      playlist: [t("m0"), t("m5")],
      belongs,
    });
    expect(ids(plan.add)).toEqual(["m1", "m2"]);
    expect(plan.remove).toEqual(["m0"]);
  });

  it("skips songs already in the playlist", () => {
    const plan = planPlaylist({
      fresh: [t("m1")],
      gone: new Set(),
      playlist: [t("m1")],
      belongs,
    });
    expect(plan.add).toEqual([]);
  });

  it("leaves songs added by hand alone", () => {
    const plan = planPlaylist({
      fresh: [],
      gone: new Set(["m9"]),
      playlist: [t("by-hand")],
      belongs,
    });
    expect(plan.remove).toEqual([]);
  });
});

describe("advanceSeen", () => {
  it("remembers what is still there and what was handled, and forgets the rest", () => {
    const source = [t("a"), t("c"), t("d"), t("e")];
    expect(advanceSeen(source, ["a", "b", "c"], [t("d")])).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("keeps a song that could not be handled as new", () => {
    expect(advanceSeen([t("a"), t("b")], ["a"], [])).toEqual(["a"]);
  });
});
