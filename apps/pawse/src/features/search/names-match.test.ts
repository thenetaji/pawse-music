import type { CatalogItem } from "@pawse/music-core";

import { namesMatch } from "./names-match";

const artist = (name: string) =>
  ({ type: "artist", id: name, name }) as unknown as CatalogItem;

test("a search is musical when YouTube Music's best match is what was typed", () => {
  expect(namesMatch("daft punk", artist("Daft Punk"))).toBe(true);
  expect(namesMatch("arijit singh songs", artist("Arijit Singh"))).toBe(true);
  expect(namesMatch("nazar", artist("Nazar Ke Samne"))).toBe(true);
});

test("a short name inside a longer search is not a match", () => {
  expect(namesMatch("money and macro korea defence", artist("Money"))).toBe(
    false,
  );
  expect(namesMatch("pol ke bol younger sibling", artist("Pol"))).toBe(false);
});
