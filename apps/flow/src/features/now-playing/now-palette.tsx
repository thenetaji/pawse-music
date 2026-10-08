import { bestThumbnail } from "@studio/music-core";
import { usePlayerState } from "@studio/player";
import { useEffect } from "react";
import { create } from "zustand";

import { FALLBACK_PALETTE, type Palette } from "./palette";
import { useArtworkPalette } from "./use-artwork-palette";

// The current track's palette, shared so the whole app can take its tint from the music.
export const useNowPalette = create<{ palette: Palette }>(() => ({
  palette: FALLBACK_PALETTE,
}));

export function NowPaletteSync() {
  const current = usePlayerState().current;
  const palette = useArtworkPalette(
    current ? bestThumbnail(current.thumbnails, 120) : undefined,
  );
  useEffect(() => useNowPalette.setState({ palette }), [palette]);
  return null;
}

/** Brightened accent, readable on black. */
export function useAccent() {
  return useNowPalette((s) => s.palette.accent);
}
