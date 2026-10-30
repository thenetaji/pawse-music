import { noteShown, orderFeed, type Seen, TOP_SHOWN } from "./for-you-order";

const vids = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((v) => v.id);
const none: Seen = { recent: [], tops: [] };

describe("orderFeed", () => {
  it("keeps the order when nothing was shown", () => {
    expect(ids(orderFeed(vids("a", "b", "c"), none))).toEqual(["a", "b", "c"]);
  });

  it("puts new videos first, then ones shown lower down, then recent leads", () => {
    const seen: Seen = { recent: ["b", "c"], tops: [["c"]] };
    expect(ids(orderFeed(vids("c", "b", "a"), seen))).toEqual(["a", "b", "c"]);
  });

  it("sends the lead of the last three refreshes to the end, the oldest lead first", () => {
    const seen: Seen = { recent: [], tops: [["x"], ["y"], ["z"]] };
    expect(ids(orderFeed(vids("x", "y", "z", "n"), seen))).toEqual([
      "n",
      "z",
      "y",
      "x",
    ]);
  });

  it("forgets a lead after three refreshes", () => {
    const seen: Seen = { recent: [], tops: [["a"], ["b"], ["c"], ["x"]] };
    expect(ids(orderFeed(vids("x", "a"), seen))[0]).toBe("x");
  });
});

describe("noteShown", () => {
  const page = Array.from({ length: 30 }, (_, i) => `v${i}`);

  it("records the head of a first page as shown and as the lead", () => {
    const next = noteShown(none, page, true);
    expect(next.tops[0]).toEqual(page.slice(0, TOP_SHOWN));
    expect(next.recent).toEqual(page.slice(0, 12));
  });

  it("keeps only the last three leads", () => {
    let seen = none;
    for (const l of ["a", "b", "c", "d"]) seen = noteShown(seen, [l], true);
    expect(seen.tops).toEqual([["d"], ["c"], ["b"]]);
  });

  it("records a later page whole without touching the leads", () => {
    const seen = noteShown({ recent: ["a"], tops: [["a"]] }, ["b", "c"], false);
    expect(seen).toEqual({ recent: ["a", "b", "c"], tops: [["a"]] });
  });

  it("moves a video shown again to the end of the list", () => {
    expect(
      noteShown({ recent: ["a", "b"], tops: [] }, ["a"], false).recent,
    ).toEqual(["b", "a"]);
  });
});
