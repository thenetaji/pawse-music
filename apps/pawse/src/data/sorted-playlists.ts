import type { Track } from "@pawse/music-core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { type GroupBy, type SortedFrom, useLibrary } from "./library";
import { isLabelled, labelFocused } from "./mood-library";
import { trackKey } from "./recommend";
import type { Section } from "./sort-groups";
import { advanceSeen, planPlaylist, sourceChanges } from "./sort-sync";
import { groupIds } from "./sorting";
import { kv } from "./storage";

export const LIKED = "liked";
const LAUNCH_DELAY_MS = 10_000;
const CHANGE_DELAY_MS = 4000;
// After a pass that could not label every new song (offline, incognito), wait before trying again.
const RETRY_AFTER_MS = 10 * 60_000;

// The ids of each source's songs that sorted playlists have already looked at, so only new ones are weighed.
const useSeen = create<{
  seen: Record<string, string[]>;
  set(source: string, ids: string[]): void;
  drop(source: string): void;
}>()(
  persist(
    (set) => ({
      seen: {},
      set: (source, ids) =>
        set((s) => ({ seen: { ...s.seen, [source]: ids } })),
      drop: (source) =>
        set((s) => {
          const { [source]: _, ...seen } = s.seen;
          return { seen };
        }),
    }),
    {
      name: "pawse.sorted.v1",
      storage: createJSONStorage(() => kv),
      version: 1,
      partialize: (s) => ({ seen: s.seen }),
    },
  ),
);

const sourceTracks = (source: string): Track[] | undefined => {
  const lib = useLibrary.getState();
  return source === LIKED
    ? lib.liked
    : lib.playlists.find((p) => p.id === source)?.tracks;
};

const isLink = (p: SortedFrom | undefined, o: SortedFrom) =>
  p?.sourceId === o.sourceId && p.by === o.by && p.group === o.group;

export function savedSection(link: SortedFrom) {
  return useLibrary
    .getState()
    .playlists.find((p) => isLink(p.sortedFrom, link));
}

/**
 * Saves a section as a playlist named "Liked · Chill". With `keep`, the playlist follows its
 * source from then on; saving the same section again only adds what is missing.
 */
export function saveSection(o: {
  name: string;
  section: Section;
  source: string;
  by: GroupBy;
  /** All of the source's songs, as of now. */
  songs: Track[];
  keep: boolean;
}): { id: string; created: boolean; added: number } {
  const lib = useLibrary.getState();
  const link: SortedFrom | undefined =
    o.keep && o.section.named
      ? { sourceId: o.source, by: o.by, group: o.section.id }
      : undefined;
  const existing = link && savedSection(link);
  if (existing)
    return {
      id: existing.id,
      created: false,
      added: lib.addManyToPlaylist(existing.id, o.section.tracks),
    };
  const id = lib.createPlaylist(
    `${o.name} · ${o.section.label}`,
    o.section.tracks,
    link,
  );
  // Songs not labelled yet stay new, so the first pass weighs them once they are.
  if (link && !useSeen.getState().seen[o.source])
    useSeen.getState().set(
      o.source,
      o.songs.filter(isLabelled).map((t) => t.id),
    );
  return { id, created: true, added: o.section.tracks.length };
}

let running: Promise<void> | undefined;
let again = false;
const blockedUntil = new Map<string, number>();

/** Brings every sorted playlist in step with its source: new songs that belong are added, songs that left are removed. */
export function syncSorted(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await pass();
    } while (again);
  })()
    .catch(() => {})
    .finally(() => {
      running = undefined;
    });
  return running;
}

async function pass() {
  const linked = useLibrary.getState().playlists.filter((p) => p.sortedFrom);
  const sources = [...new Set(linked.map((p) => p.sortedFrom!.sourceId))];
  for (const source of sources) await syncSource(source);
}

async function syncSource(source: string) {
  const lib = useLibrary.getState();
  const list = sourceTracks(source);
  const mine = lib.playlists.filter((p) => p.sortedFrom?.sourceId === source);
  if (!list) {
    for (const p of mine) lib.unlinkPlaylist(p.id);
    useSeen.getState().drop(source);
    return;
  }
  const seen = useSeen.getState().seen[source];
  // A restored backup has the links but not what they had looked at: take the source as it is.
  if (!seen)
    return useSeen.getState().set(
      source,
      list.map((t) => t.id),
    );

  const { fresh, gone } = sourceChanges(list, seen);
  if (!fresh.length && !gone.size) return;
  const wait = (blockedUntil.get(source) ?? 0) > Date.now();
  const handled = fresh.length && !wait ? await labelFocused(fresh) : [];
  if (fresh.length && handled.length < fresh.length && !wait)
    blockedUntil.set(source, Date.now() + RETRY_AFTER_MS);

  for (const by of new Set(mine.map((p) => p.sortedFrom!.by))) {
    const ids = handled.length
      ? groupIds(by, handled)
      : new Map<string, string | undefined>();
    for (const p of mine.filter((m) => m.sortedFrom!.by === by)) {
      // The library may have changed while labels were fetched.
      const now = useLibrary.getState().playlists.find((x) => x.id === p.id);
      if (!now?.sortedFrom) continue;
      const { group } = now.sortedFrom;
      const plan = planPlaylist({
        fresh: handled,
        gone,
        playlist: now.tracks,
        belongs: (t) => ids.get(trackKey(t)) === group,
      });
      if (plan.remove.length) lib.removeManyFromPlaylist(p.id, plan.remove);
      if (plan.add.length) lib.addManyToPlaylist(p.id, plan.add);
    }
  }
  if (handled.length || gone.size)
    useSeen
      .getState()
      .set(source, advanceSeen(sourceTracks(source) ?? list, seen, handled));
}

/** Keeps sorted playlists in step in the background: shortly after launch and after any change to likes or playlists. */
export function startSortKeeper(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const kick = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncSorted(), ms);
  };
  if (useLibrary.persist.hasHydrated()) kick(LAUNCH_DELAY_MS);
  const unhydrate = useLibrary.persist.onFinishHydration(() =>
    kick(LAUNCH_DELAY_MS),
  );
  const unsub = useLibrary.subscribe((s, prev) => {
    if (s.liked !== prev.liked || s.playlists !== prev.playlists)
      kick(CHANGE_DELAY_MS);
  });
  return () => {
    clearTimeout(timer);
    unhydrate();
    unsub();
  };
}
