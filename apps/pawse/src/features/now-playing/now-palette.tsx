import { bestThumbnail } from "@pawse/music-core";
import { usePlayerSelect } from "@pawse/player";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";

import { useSetting } from "../../lib/settings";
import { useSongArt } from "../../lib/song-art";

import { FALLBACK_PALETTE, type Palette } from "./palette";
import { useArtworkPalette } from "./use-artwork-palette";

// The current track's palette, shared so the whole app can take its tint from the music.
export const useNowPalette = create<{ palette: Palette }>(() => ({
  palette: FALLBACK_PALETTE,
}));

// A new song's colours wait until it plays (at least MIN_MS) or MAX_MS pass, off the skip's render.
const SETTLE_MIN_MS = 120;
const SETTLE_MAX_MS = 500;

export function NowPaletteSync() {
  const current = usePlayerSelect((s) => s.current);
  const playing = usePlayerSelect((s) => s.status === "playing");
  // Same art the player shows (album cover over a video still), so there's one palette per song.
  const thumbs = useSongArt(current);
  const palette = useArtworkPalette(
    current ? bestThumbnail(thumbs, 120) : undefined,
  );
  const id = current?.id;
  const [shown, setShown] = useState(id);
  const changedAt = useRef(0);
  useEffect(() => {
    changedAt.current = Date.now();
  }, [id]);
  useEffect(() => {
    if (shown === id) return;
    const waited = Date.now() - changedAt.current;
    const wait = (playing ? SETTLE_MIN_MS : SETTLE_MAX_MS) - waited;
    const t = setTimeout(() => setShown(id), Math.max(0, wait));
    return () => clearTimeout(t);
  }, [id, playing, shown]);
  useEffect(() => {
    if (shown !== id || useNowPalette.getState().palette === palette) return;
    useNowPalette.setState({ palette });
  }, [shown, id, palette]);
  return null;
}

/** Brightened accent, readable on black. */
export function useAccent() {
  const fromArt = useNowPalette((s) => s.palette.accent);
  const mode = useSetting<"artwork" | "fixed">("accentMode", "artwork");
  const fixed = useSetting("accentColor", "#8B7CFF");
  return readable(mode === "fixed" ? fixed : fromArt);
}

// Lifts dark or muddy artwork colours so text in the accent stays legible on black.
export function readable(color: string): string {
  let r: number;
  let g: number;
  let b: number;
  if (color.startsWith("#") && color.length === 7) {
    const n = Number.parseInt(color.slice(1), 16);
    [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
  } else {
    const m = color.match(/\d+(\.\d+)?/g);
    if (!m || m.length < 3) return color;
    [r, g, b] = m.slice(0, 3).map(Number);
  }
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let l = (max + min) / 2;
  let s =
    max === min
      ? 0
      : l > 0.5
        ? (max - min) / (2 - max - min)
        : (max - min) / (max + min);
  let h = 0;
  if (max !== min) {
    const d = max - min;
    const [R, G, B] = [r / 255, g / 255, b / 255];
    h =
      max === R
        ? (G - B) / d + (G < B ? 6 : 0)
        : max === G
          ? (B - R) / d + 2
          : (R - G) / d + 4;
    h /= 6;
  }
  if (l >= 0.62 && s >= 0.35) return color;
  l = Math.max(l, 0.66);
  s = s < 0.12 ? s : Math.max(s, 0.55);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return `rgb(${Math.round(f(h + 1 / 3) * 255)},${Math.round(f(h) * 255)},${Math.round(f(h - 1 / 3) * 255)})`;
}
