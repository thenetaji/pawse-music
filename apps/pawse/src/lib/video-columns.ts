const TILE = 300;
const GAP = 16;
const MAX_COLUMNS = 8;

/** One edge-to-edge column on phones; wider screens fit as many tiles as they can, so a thumbnail never grows huge. */
export function videoColumns(width: number): number {
  if (width < 640) return 1;
  const fit = Math.floor((width - GAP) / (TILE + GAP));
  return Math.min(MAX_COLUMNS, Math.max(2, fit));
}
