import type { Track } from "@pawse/music-core";
import { create } from "zustand";

/** How a list page shows its songs; the playlist itself, on this device or on YouTube, is never reordered. */
export const VIEW_ORDERS = [
  ["oldest", "Date added, oldest first"],
  ["newest", "Date added, newest first"],
  ["az", "Title A to Z"],
  ["za", "Title Z to A"],
] as const;
export type ViewOrder = (typeof VIEW_ORDERS)[number][0];

const byTitle = (a: Track, b: Track) =>
  a.title.localeCompare(b.title, undefined, {
    sensitivity: "base",
    numeric: true,
  });

/**
 * The songs in a view order, and where each one sits in the original list.
 * The list arrives in the order songs were added, so that order (or its reverse) is the date sort.
 */
export function orderTracks(
  tracks: Track[],
  order: ViewOrder | undefined,
): { tracks: Track[]; from: number[] } {
  const idx = tracks.map((_, i) => i);
  if (!order || order === "oldest") return { tracks, from: idx };
  if (order === "newest") idx.reverse();
  else {
    const sign = order === "az" ? 1 : -1;
    idx.sort((a, b) => sign * byTitle(tracks[a], tracks[b]) || a - b);
  }
  return { tracks: idx.map((i) => tracks[i]), from: idx };
}

// The choice lasts until the app closes; a list opens in its own order.
const useView = create<Record<string, ViewOrder | undefined>>(() => ({}));

export const useViewOrder = (list: string): ViewOrder | undefined =>
  useView((s) => s[list]);
export const setViewOrder = (list: string, order: ViewOrder | undefined) =>
  useView.setState({ [list]: order });
