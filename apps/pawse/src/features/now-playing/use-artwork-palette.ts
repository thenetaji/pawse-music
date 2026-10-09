import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";

import { createAsyncCache } from "../../lib/async-cache";
import { FALLBACK_PALETTE, type Palette, pickPalette } from "./palette";

const cache = createAsyncCache<Palette>(24 * 3600_000);

// Native: decode with Skia, scale to 24×24 and read pixels.
async function extract(url: string): Promise<Palette> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(url));
  const surface =
    Skia.Surface.MakeOffscreen(24, 24) ?? Skia.Surface.Make(24, 24);
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

export function useArtworkPalette(url?: string): Palette {
  return cache.use(url ?? null, () => extract(url!)).data ?? FALLBACK_PALETTE;
}
