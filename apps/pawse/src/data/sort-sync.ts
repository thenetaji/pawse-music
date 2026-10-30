import type { Track } from "@pawse/music-core";

export type SourceChanges = {
  /** In the source but not yet looked at. */
  fresh: Track[];
  /** Looked at before, no longer in the source. */
  gone: Set<string>;
};

export function sourceChanges(source: Track[], seen: string[]): SourceChanges {
  const was = new Set(seen);
  const now = new Set(source.map((t) => t.id));
  return {
    fresh: source.filter((t) => !was.has(t.id)),
    gone: new Set(seen.filter((id) => !now.has(id))),
  };
}

/** What a sorted playlist needs: new songs that belong in it, and songs that left the source. Songs added by hand are left alone. */
export function planPlaylist(o: {
  fresh: Track[];
  gone: Set<string>;
  playlist: Track[];
  belongs: (t: Track) => boolean;
}): { add: Track[]; remove: string[] } {
  const have = new Set(o.playlist.map((t) => t.id));
  return {
    add: o.fresh.filter((t) => !have.has(t.id) && o.belongs(t)),
    remove: o.playlist.filter((t) => o.gone.has(t.id)).map((t) => t.id),
  };
}

/** The ids to remember after a pass: what was remembered and is still in the source, plus what the pass handled. */
export function advanceSeen(
  source: Track[],
  seen: string[],
  handled: Track[],
): string[] {
  const keep = new Set([...seen, ...handled.map((t) => t.id)]);
  return [...new Set(source.map((t) => t.id))].filter((id) => keep.has(id));
}
