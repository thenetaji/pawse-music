export type Palette = {
  colors: [string, string, string, string];
  accent: string;
  accentDeep: string;
  dark: boolean;
};

export const FALLBACK_PALETTE: Palette = {
  colors: ["rgb(58,42,90)", "rgb(122,42,58)", "rgb(26,58,90)", "rgb(30,30,36)"],
  accent: "#8B7CFF",
  accentDeep: "#4B3BD6",
  dark: true,
};

// Picks four distinct, vivid colours from RGBA pixels and darkens them so white text stays legible.
export function pickPalette(rgba: ArrayLike<number>): Palette {
  const px: { r: number; g: number; b: number; score: number; v: number }[] =
    [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i],
      g = rgba[i + 1],
      b = rgba[i + 2];
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b);
    const s = mx ? (mx - mn) / mx : 0,
      v = mx / 255;
    px.push({ r, g, b, v, score: s * 0.7 + v * 0.3 });
  }
  if (!px.length) return FALLBACK_PALETTE;
  const avg = px.reduce((a, p) => a + p.v, 0) / px.length;
  px.sort((a, b) => b.score - a.score);
  const picks: typeof px = [];
  for (const p of px) {
    if (
      picks.every(
        (q) =>
          Math.abs(q.r - p.r) + Math.abs(q.g - p.g) + Math.abs(q.b - p.b) > 90,
      )
    )
      picks.push(p);
    if (picks.length === 4) break;
  }
  while (picks.length < 4) picks.push(px[(picks.length * 7919) % px.length]);
  const k = avg < 0.35 ? 0.55 : 0.78;
  const dim = (p: (typeof px)[number], f: number) =>
    `rgb(${Math.round(p.r * f)},${Math.round(p.g * f)},${Math.round(p.b * f)})`;
  return {
    colors: picks.map((p) => dim(p, k)) as Palette["colors"],
    accent: dim(picks[0], 1),
    accentDeep: dim(picks[1], 0.7),
    dark: avg < 0.35,
  };
}

/** Samples a w×h RGBA buffer down to roughly `target` pixels per side. */
export function sample(
  rgba: ArrayLike<number>,
  w: number,
  h: number,
  target = 24,
): number[] {
  const out: number[] = [];
  const sx = Math.max(1, Math.floor(w / target)),
    sy = Math.max(1, Math.floor(h / target));
  for (let y = 0; y < h; y += sy)
    for (let x = 0; x < w; x += sx) {
      const i = (y * w + x) * 4;
      out.push(rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]);
    }
  return out;
}
