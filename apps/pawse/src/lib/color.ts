/** The colour at this opacity, for an "#rrggbb" or "rgb(r,g,b)" string. */
export function withAlpha(color: string, alpha: number): string {
  let rgb: number[];
  if (color.startsWith("#") && color.length === 7) {
    const n = Number.parseInt(color.slice(1), 16);
    rgb = [n >> 16, (n >> 8) & 255, n & 255];
  } else {
    rgb = (color.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    if (rgb.length < 3) return color;
  }
  return `rgba(${rgb.join(",")},${alpha})`;
}
