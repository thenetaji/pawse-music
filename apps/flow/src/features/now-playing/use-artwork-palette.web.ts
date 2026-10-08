import { createAsyncCache } from "../../lib/async-cache";
import { FALLBACK_PALETTE, type Palette, pickPalette } from "./palette";

const cache = createAsyncCache<Palette>(24 * 3600_000);

function extract(url: string): Promise<Palette> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => resolve(FALLBACK_PALETTE);
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const x = c.getContext("2d");
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

export function useArtworkPalette(url?: string): Palette {
  return cache.use(url ?? null, () => extract(url!)).data ?? FALLBACK_PALETTE;
}
