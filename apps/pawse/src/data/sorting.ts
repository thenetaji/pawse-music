import type { Track } from "@pawse/music-core";
import { useMemo } from "react";
import { create } from "zustand";

import { type GroupBy, useLibrary } from "./library";
import { evidenceOf, useMoodLabels } from "./mood-library";
import { trackKey } from "./recommend";
import {
  assignGroups,
  type Entry,
  type Section,
  toSections,
} from "./sort-groups";

type Known = NonNullable<Parameters<typeof evidenceOf>[1]>;

const entryOf =
  (known: Known) =>
  (track: Track): Entry => ({
    track,
    key: trackKey(track),
    ev: evidenceOf(track, known),
  });

// Everything the user keeps or plays tells which language an artist sings in.
const libraryTracks = (): Track[] => {
  const { liked, playlists, history } = useLibrary.getState();
  return [
    ...liked,
    ...playlists.flatMap((p) => p.tracks),
    ...history.map((p) => p.track),
  ];
};

/** The group id of each song of a list, by trackKey; none where nothing confident says. */
export function groupIds(
  by: GroupBy,
  tracks: Track[],
  known: Known = useMoodLabels.getState(),
): Map<string, string | undefined> {
  const entry = entryOf(known);
  return assignGroups(
    by,
    tracks.map(entry),
    by === "language" ? libraryTracks().map(entry) : [],
  );
}

export function sectionsFor(
  by: GroupBy,
  tracks: Track[],
  known?: Known,
): Section[] {
  const ids = groupIds(by, tracks, known);
  return toSections(
    by,
    tracks.map((track) => ({ track, group: ids.get(trackKey(track)) })),
  );
}

/** A list's sections, redone as labels arrive; undefined while grouping is off. */
export function useSections(
  tracks: Track[],
  by: GroupBy | undefined,
): Section[] | undefined {
  const labels = useMoodLabels((s) => s.labels);
  const lists = useMoodLabels((s) => s.lists);
  return useMemo(
    () => (by ? sectionsFor(by, tracks, { labels, lists }) : undefined),
    [by, tracks, labels, lists],
  );
}

// The choice lasts until the app closes; a list opens ungrouped.
const useView = create<Record<string, GroupBy | undefined>>(() => ({}));

export const useGroupBy = (list: string): GroupBy | undefined =>
  useView((s) => s[list]);
export const setGroupBy = (list: string, by: GroupBy | undefined) =>
  useView.setState({ [list]: by });
