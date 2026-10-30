// Cover sizes by place, and the sources to try for a big cover. YouTube Music covers (lh3.googleusercontent.com)
// resize by a URL suffix; video stills (i.ytimg.com) have bigger, bar-free HD files that some videos lack.
import { bestThumbnail, type Thumbnail } from "@pawse/music-core";
import { useState } from "react";

/** Now playing, the full-screen cover, the share card and the lock screen. */
export const COVER_PX = 1200;
/** Data saver on mobile data. */
export const COVER_SAVER_PX = 544;
const YTIMG = /^https?:\/\/i\d?\.ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//;

/** Bigger stills without letterbox bars first, the original last (YouTube's missing ones are 120 px placeholders). */
export function artworkSources(url: string): string[] {
  const id = YTIMG.exec(url)?.[1];
  if (!id) return [url];
  const base = `https://i.ytimg.com/vi/${id}/`;
  return [...new Set([`${base}maxresdefault.jpg`, `${base}hq720.jpg`, url])];
}

/** A big cover to try first, then safer ones: the catalog's own size is the last resort when a resize fails. */
export function coverSources(
  thumbnails: Thumbnail[],
  px = COVER_PX,
  saver = false,
): string[] {
  const original = bestThumbnail(thumbnails);
  if (!original) return [];
  if (saver) return [bestThumbnail(thumbnails, COVER_SAVER_PX) ?? original];
  if (YTIMG.test(original)) return artworkSources(original);
  return [...new Set([bestThumbnail(thumbnails, px) ?? original, original])];
}

/** The pixels a cover in a list or grid needs, in a few steps so rows share cached images. */
export function listCoverPx(size: number, saver = false): number {
  const need = Math.round(size * (saver ? 1.5 : 3));
  if (saver) return need <= 150 ? 150 : 300;
  return need <= 300 ? 300 : 544;
}

/** The current source for a cover; `next` moves to the following one when an image fails or loads as a placeholder. */
export function useCover(key: string | undefined, sources: string[]) {
  const [miss, setMiss] = useState({ key: "", n: 0 });
  const n = miss.key === (key ?? "") ? miss.n : 0;
  return {
    uri: sources[n],
    next: () => setMiss({ key: key ?? "", n: n + 1 }),
  };
}
