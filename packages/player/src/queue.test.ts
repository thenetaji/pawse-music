import type { Track } from "@studio/music-core";

import * as Q from "./queue";

const t = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [],
  thumbnails: [],
});
const ids = (q: Q.Queue) => q.tracks.map((x) => x.id);

test("shuffle keeps the current track playing and unshuffle restores the order, including edits made meanwhile", () => {
  let q = Q.createQueue(["a", "b", "c", "d", "e"].map(t), 2);
  q = Q.shuffle(q, () => 0);
  expect(q.index).toBe(0);
  expect(ids(q)[0]).toBe("c");
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
