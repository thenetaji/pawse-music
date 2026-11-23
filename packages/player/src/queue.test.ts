import type { Track } from "@pawse/music-core";

import * as Q from "./queue";

const t = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [],
  thumbnails: [],
});
const ids = (q: Q.Queue) => q.tracks.map((x) => x.id);

test("shuffle mixes only what is still to come and unshuffle restores it, including edits made meanwhile", () => {
  let q = Q.createQueue(["a", "b", "c", "d", "e"].map(t), 2);
  q = Q.shuffle(q, () => 0);
  expect(q.index).toBe(2);
  expect(ids(q).slice(0, 3)).toEqual(["a", "b", "c"]);
  expect(ids(q).slice(3).sort()).toEqual(["d", "e"]);
  q = Q.insertNext(q, t("x"));
  q = Q.remove(
    q,
    q.tracks.findIndex((x) => x.id === "a"),
  );
  q = Q.append(q, [t("y")]);
  q = Q.unshuffle(q);
  expect(ids(q)).toEqual(["b", "c", "x", "d", "e", "y"]);
  expect(ids(q)[q.index]).toBe("c");
});

test("a new queue keeps the songs heard before it, and Previous reaches them", () => {
  const prev = Q.createQueue(["a", "b", "c", "d"].map(t), 2);
  const q = Q.withHistory(Q.createQueue(["x", "y"].map(t)), prev);
  expect(ids(q)).toEqual(["a", "b", "c", "x", "y"]);
  expect(ids(q)[q.index]).toBe("x");
  expect(Q.listStart(q)).toBe(3);
  expect(Q.stepIndex(q.tracks.length, q.index, -1, false)).toBe(2);
  // Repeat all loops the new list, not the history.
  expect(Q.stepIndex(q.tracks.length, 4, 1, true, Q.listStart(q))).toBe(3);
});

test("history keeps the last 50 songs and does not repeat a radio's seed", () => {
  const many = Array.from({ length: 80 }, (_, i) => t(`s${i}`));
  const prev = Q.createQueue(many, 79);
  const q = Q.withHistory(Q.createQueue([t("s79"), t("r1")]), prev);
  expect(q.index).toBe(49);
  expect(ids(q)[0]).toBe("s30");
  expect(ids(q).slice(-3)).toEqual(["s78", "s79", "r1"]);
});

test("clearing history keeps the song playing and what comes next", () => {
  const prev = Q.createQueue(["a", "b"].map(t), 1);
  let q = Q.withHistory(Q.createQueue(["x", "y"].map(t)), prev);
  q = Q.clearHistory(q);
  expect(ids(q)).toEqual(["x", "y"]);
  expect(q.index).toBe(0);
  expect(Q.listStart(q)).toBe(0);
});

test("removing the first song of the list moves the loop point to the next one", () => {
  const prev = Q.createQueue(["a"].map(t), 0);
  let q = Q.withHistory(Q.createQueue(["x", "y", "z"].map(t)), prev);
  q = Q.remove(q, 1);
  expect(ids(q)[Q.listStart(q)]).toBe("y");
});

test("move and remove keep the index on the playing entry", () => {
  let q = Q.createQueue(["a", "b", "c", "d"].map(t), 2);
  q = Q.move(q, 0, 3);
  expect(ids(q)[q.index]).toBe("c");
  q = Q.move(q, q.index, 0);
  expect(q.index).toBe(0);
  q = Q.remove(q, 0);
  expect(ids(q)[q.index]).toBe("b");
  q = Q.remove(q, q.tracks.length - 1);
  expect(ids(q)[q.index]).toBe("b");
});
