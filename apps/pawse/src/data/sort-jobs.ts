import type { Track } from "@pawse/music-core";
import { create } from "zustand";

import { useLibrary } from "./library";
import { ensureMoodLists, labelFocused } from "./mood-library";

export type SortJob =
  | { state: "queued" }
  | { state: "working"; done: number; total: number }
  // Stopped, or unable to go on (incognito, data saver, no connection); starting again picks up where it left off.
  | { state: "paused"; done: number; total: number }
  | { state: "done"; total: number };

// Jobs live here, not in the page, so leaving it keeps one running and coming back shows where it got to.
export const useSortJobs = create<Record<string, SortJob | undefined>>(
  () => ({}),
);

const set = (list: string, job: SortJob) =>
  useSortJobs.setState({ [list]: job });

const WAIT_FOR_LISTS_MS = 8000;
const stops = new Set<string>();
let queue: Promise<void> = Promise.resolve();

async function run(list: string, songs: Track[], region: string) {
  const total = songs.length;
  const incognito = useLibrary.getState().settings.incognito;
  set(list, { state: "working", done: 0, total });
  if (!incognito)
    await Promise.race([
      ensureMoodLists(region),
      new Promise((r) => setTimeout(r, WAIT_FOR_LISTS_MS)),
    ]);
  const done = await labelFocused(songs, {
    onProgress: (n) => set(list, { state: "working", done: n, total }),
    stopped: () => stops.has(list),
  });
  set(
    list,
    done.length === total
      ? { state: "done", total }
      : { state: "paused", done: done.length, total },
  );
}

/** Looks up what the list's songs lack, one at a time in the background; songs already known are skipped, so it resumes. */
export function startSort(list: string, songs: Track[], region: string) {
  const now = useSortJobs.getState()[list]?.state;
  if (now === "queued" || now === "working") return;
  stops.delete(list);
  set(list, { state: "queued" });
  queue = queue
    .then(() => run(list, songs, region))
    .catch(() => set(list, { state: "paused", done: 0, total: songs.length }));
}

export const stopSort = (list: string) => void stops.add(list);
