import type { Vibe } from "../../lib/vibe";

type Nudge = {
  hue?: [target: number, amount: number];
  sat: number;
  light: number;
};

const NUDGES: Record<Vibe, Nudge> = {
  groove: { sat: 1, light: 0 },
  love: { hue: [350, 0.3], sat: 1.1, light: 0.02 },
  vibe: { hue: [210, 0.3], sat: 0.8, light: 0.05 },
  sad: { hue: [225, 0.25], sat: 0.75, light: 0 },
  hype: { sat: 1.3, light: 0.04 },
};

function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function toHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${[r, g, b]
    .map((v) =>
      Math.round((v + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The song's colour nudged by its mood: warmer for love, cooler and softer for chill, punchier for hype. */
export function moodGlow(tint: string | null, vibe: Vibe): string | null {
  if (!tint || !/^#[0-9a-f]{6}$/i.test(tint)) return tint;
  const nudge = NUDGES[vibe];
  let [h, s, l] = toHsl(tint);
  if (nudge.hue && s > 0.05) {
    const [target, amount] = nudge.hue;
    const delta = ((target - h + 540) % 360) - 180;
    h = (h + delta * amount + 360) % 360;
  }
  s = clamp(s * nudge.sat, 0, 1);
  l = clamp(l + nudge.light, 0.35, 0.78);
  return toHex(h, s, l);
}
