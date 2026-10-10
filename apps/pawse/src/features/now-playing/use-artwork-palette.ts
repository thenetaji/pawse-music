import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
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

// Native: decode with Skia on a raster surface (no GPU readback), scale to 24×24 and read pixels.
async function extract(url: string): Promise<Palette> {
  const data = await Skia.Data.fromURI(url);
  await idle();
  const image = Skia.Image.MakeImageFromEncoded(data);
  const surface =
    Skia.Surface.Make(24, 24) ?? Skia.Surface.MakeOffscreen(24, 24);
  if (!image || !surface) return FALLBACK_PALETTE;
  surface
    .getCanvas()
    .drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, 24, 24),
      Skia.Paint(),
    );
  surface.flush();
  const px = surface.makeImageSnapshot().readPixels(0, 0, {
    width: 24,
    height: 24,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  return px ? pickPalette(px as Uint8Array) : FALLBACK_PALETTE;
}

// While the next artwork loads, the last palette stays, so colours don't flash grey between songs.
export function useArtworkPalette(url?: string): Palette {
  const src = url ? smallArt(url) : null;
  const { data, loading } = useCachedPalette(src, () => extract(src!));
  const [held, setHeld] = useState(FALLBACK_PALETTE);
  if (data && data !== held) setHeld(data);
  return data ?? (loading ? held : FALLBACK_PALETTE);
}
