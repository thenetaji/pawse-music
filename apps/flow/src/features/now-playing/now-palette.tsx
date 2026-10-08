import { bestThumbnail } from "@studio/music-core";
import { usePlayerState } from "@studio/player";
import { useEffect } from "react";
import { create } from "zustand";

import { useSetting } from "../../lib/settings";

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
  const fromArt = useNowPalette((s) => s.palette.accent);
  const mode = useSetting<"artwork" | "fixed">("accentMode", "artwork");
  const fixed = useSetting("accentColor", "#8B7CFF");
  return mode === "fixed" ? fixed : fromArt;
}
