import type { CatalogItem } from "@pawse/music-core";

const plain = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const titleOf = (i: CatalogItem) => (i.type === "artist" ? i.name : i.title);

/** Whether YouTube Music's best match is what was searched for, by name: "daft punk" and the artist Daft Punk. */
export function namesMatch(query: string, item?: CatalogItem): boolean {
  const q = plain(query);
  const n = item ? plain(titleOf(item)) : "";
  // A short name inside a longer search ("Money" in "money and macro korea defence") is not a match.
  return (
    q.length >= 3 &&
    n.length >= 3 &&
    (n.includes(q) || (q.includes(n) && n.length >= q.length * 0.6))
  );
}
