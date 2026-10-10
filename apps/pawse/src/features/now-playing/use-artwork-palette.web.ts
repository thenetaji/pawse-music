import { useState } from "react";

import { createAsyncCache } from "../../lib/async-cache";
import { FALLBACK_PALETTE, type Palette, pickPalette } from "./palette";

const cache = createAsyncCache<Palette>(24 * 3600_000);
// Named as a hook so the React Compiler never memoizes the call away.
const useCachedPalette = cache.use;

// bestThumbnail only resizes Google art; YouTube and JioSaavn would hand over their largest image.
function smallArt(url: string): string {
  const yt = url.match(/ytimg\.com\/vi(?:_webp)?\/([\w-]{11})\//)?.[1];
  if (yt) return `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`;
  if (/saavncdn\.com/.test(url))
    return url.replace(/\d+x\d+(\.\w+)$/, "150x150$1");
  return url;
}

// Waits for an idle moment, so decoding never lands in the same frame as a song change.
const idle = () =>
  new Promise<void>((resolve) => {
    if (typeof requestIdleCallback === "function")
      requestIdleCallback(() => resolve(), { timeout: 300 });
    else setTimeout(resolve, 0);
  });

function extract(url: string): Promise<Palette> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onerror = () => resolve(FALLBACK_PALETTE);
    img.onload = async () => {
      await idle();
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const x = c.getContext("2d", { willReadFrequently: true });
        if (!x) return resolve(FALLBACK_PALETTE);
        x.drawImage(img, 0, 0, 24, 24);
        resolve(pickPalette(x.getImageData(0, 0, 24, 24).data));
      } catch {
        resolve(FALLBACK_PALETTE);
      }
    };
    img.src = url;
  });
}

// While the next artwork loads, the last palette stays, so colours don't flash grey between songs.
export function useArtworkPalette(url?: string): Palette {
  const src = url ? smallArt(url) : null;
  const { data, loading } = useCachedPalette(src, () => extract(src!));
  const [held, setHeld] = useState(FALLBACK_PALETTE);
  if (data && data !== held) setHeld(data);
  return data ?? (loading ? held : FALLBACK_PALETTE);
}
