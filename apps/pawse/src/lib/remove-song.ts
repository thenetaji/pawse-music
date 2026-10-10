// Songs the listener removed or disliked, plus the "Hide explicit songs" setting,
// applied to every Home shelf including ones built from history.
import type { CatalogItem, Shelf } from "@pawse/music-core";

import { useLibrary } from "../data/library";
import { useSignals } from "../data/signals";
import { haptic } from "./haptics";
import { setSetting } from "./settings";

const KEEP = 500;

type Song = { id: string; explicit?: boolean };

/** Takes a song out of listening history and keeps it off Home for good. */
export function removeSong(track: Song) {
  const lib = useLibrary.getState();
  const prev = lib.settings.hiddenFromHome ?? [];
  haptic.light();
  useLibrary.setState({
    history: lib.history.filter((p) => p.track.id !== track.id),
  });
  useSignals.setState((st) => {
    if (!(track.id in st.tracks)) return st;
    const { [track.id]: _gone, ...rest } = st.tracks;
    return { tracks: rest };
  });
  setSetting(
    "hiddenFromHome",
    [track.id, ...prev.filter((id) => id !== track.id)].slice(0, KEEP),
  );
}

/** True for songs Home may show. */
export function useHomeKeep(): (t: Song) => boolean {
  const hidden = useLibrary((s) => s.settings.hiddenFromHome);
  const explicit = useLibrary((s) => s.settings.explicitFilter);
  const disliked = useLibrary((s) => s.disliked);
  // Disliked songs stay off Home too, including shelves built from history.
  const set = new Set([...(hidden ?? []), ...disliked.map((t) => t.id)]);
  return (t) => !set.has(t.id) && !(explicit && t.explicit === true);
}

/** Drops hidden songs from shelves, and shelves left empty. */
export function keepShelves(shelves: Shelf[], keep: (t: Song) => boolean) {
  const out: Shelf[] = [];
  for (const s of shelves) {
    const items = s.items.filter(
      (i: CatalogItem) => i.type !== "track" || keep(i),
    );
    if (items.length)
      out.push(items.length === s.items.length ? s : { ...s, items });
  }
  return out;
}
