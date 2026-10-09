import { normalizeTitle } from "@pawse/innertube";
import type { Track } from "@pawse/music-core";

import type { ImportItem } from "./formats";

// Pure scoring of a search result against an imported song; 0..1.
export const MATCH_SCORE = 0.8;
export const UNSURE_SCORE = 0.5;

const NOISE =
  /[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|hd|hq|4k|mv|m\/v)\b[^)\]]*[)\]]/gi;
const VERSION_TAGS = [
  "live",
  "remix",
  "acoustic",
  "karaoke",
  "instrumental",
  "cover",
  "sped up",
  "slowed",
  "reverb",
  "nightcore",
  "8d",
  "demo",
  "unplugged",
];

export const normTitle = (s: string): string =>
  normalizeTitle(s.replace(NOISE, " "));

export const normArtist = (s: string): string =>
  normalizeTitle(s.replace(/\s+-\s+topic$/i, ""))
    .replace(/^the /, "")
    .trim();

const tokens = (s: string) => s.split(" ").filter(Boolean);

function dice(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const rest = [...b];
  let hit = 0;
  for (const t of a) {
    const i = rest.indexOf(t);
    if (i >= 0) {
      hit++;
      rest.splice(i, 1);
    }
  }
  return (2 * hit) / (a.length + b.length);
}

const bigrams = (s: string) => {
  const x = s.replace(/ /g, "");
  const out: string[] = [];
  for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2));
  return out.length ? out : [x];
};

/** Similarity of two raw titles: words, then letter pairs for typos, then one containing the other. */
export function titleSimilarity(a: string, b: string): number {
  const na = normTitle(a);
  const nb = normTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(na);
  const tb = tokens(nb);
  let s = Math.max(dice(ta, tb), dice(bigrams(na), bigrams(nb)) * 0.95);
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.every((t) => long.includes(t))) s = Math.max(s, 0.85);
  // "Song (Live)" is a different recording from "Song".
  const tagged = (n: string) =>
    VERSION_TAGS.filter((t) => ` ${n} `.includes(` ${t} `));
  const ga = tagged(na);
  const gb = tagged(nb);
  if (ga.some((t) => !gb.includes(t)) || gb.some((t) => !ga.includes(t)))
    s -= 0.3;
  return Math.max(0, Math.min(1, s));
}

const splitArtists = (s: string) =>
  s
    .split(/\s*(?:,|;|&|\/|\+|\bx\b|\band\b|\bfeat\.?|\bft\.?|\bwith\b)\s*/i)
    .map(normArtist)
    .filter(Boolean);

/** Best overlap between any listed artist and any of the track's artists; undefined when the import has none. */
export function artistSimilarity(
  query: string | undefined,
  artists: { name: string }[],
): number | undefined {
  if (!query?.trim()) return undefined;
  const want = splitArtists(query);
  const have = artists.flatMap((a) => splitArtists(a.name));
  if (!want.length) return undefined;
  if (!have.length) return 0;
  let best = 0;
  for (const w of want)
    for (const h of have) {
      if (w === h) return 1;
      const s =
        h.includes(w) || w.includes(h)
          ? 0.85
          : dice(tokens(w), tokens(h)) * 0.9;
      best = Math.max(best, s);
    }
  return best;
}

/** 1 within ±5 s, then falling off; undefined when either side is unknown. */
export function durationSimilarity(
  a: number | undefined,
  b: number | undefined,
): number | undefined {
  if (!a || !b) return undefined;
  const d = Math.abs(a - b);
  return d <= 5 ? 1 : d <= 15 ? 0.5 : d <= 30 ? 0.2 : 0;
}

/** Weighted title / artist / duration score; a title-only match never reaches MATCH_SCORE. */
export function scoreTrack(item: ImportItem, track: Track): number {
  const parts: [number, number | undefined][] = [
    [0.55, titleSimilarity(item.title, track.title)],
    [0.3, artistSimilarity(item.artist, track.artists)],
    [0.15, durationSimilarity(item.durationSec, track.durationSec)],
  ];
  let sum = 0;
  let weight = 0;
  for (const [w, v] of parts)
    if (v !== undefined) {
      sum += w * v;
      weight += w;
    }
  let score = weight ? sum / weight : 0;
  const dur = parts[2][1];
  if (dur === 0) score *= 0.8;
  if (parts[1][1] === undefined && dur === undefined)
    score = Math.min(score, MATCH_SCORE - 0.01);
  // A wrong title is never rescued by the artist.
  if ((parts[0][1] ?? 0) < 0.5) score = Math.min(score, UNSURE_SCORE - 0.01);
  return score;
}
