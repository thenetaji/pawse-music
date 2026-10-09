import type { Track } from "@pawse/music-core";

import { strip, useLibrary } from "../library";
import type { MatchResult } from "./match";

export type ImportTarget =
  | { kind: "liked" }
  | { kind: "playlist"; title: string };

const matchedTracks = (results: MatchResult[]): Track[] => {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const r of results) {
    const t = r.status === "matched" ? r.track : undefined;
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(strip(t));
  }
  return out;
};

/** Saves matched songs to liked or a local playlist (reusing one with the same title); skips songs already there. */
export function commitImport(
  results: MatchResult[],
  target: ImportTarget,
): { added: number } {
  const tracks = matchedTracks(results);
  const lib = useLibrary.getState();
  // Direct state writes, so a bulk import never fires like side effects (YouTube rating, auto-download).
  if (target.kind === "liked") {
    const have = new Set(lib.liked.map((t) => t.id));
    const fresh = tracks.filter((t) => !have.has(t.id));
    if (fresh.length)
      useLibrary.setState((s) => ({ liked: [...s.liked, ...fresh] }));
    return { added: fresh.length };
  }
  const title = target.title.trim() || "Imported";
  const existing = lib.playlists.find(
    (p) => p.title.trim().toLowerCase() === title.toLowerCase(),
  );
  if (!existing) {
    if (tracks.length) lib.createPlaylist(title, tracks);
    return { added: tracks.length };
  }
  const have = new Set(existing.tracks.map((t) => t.id));
  const fresh = tracks.filter((t) => !have.has(t.id));
  if (fresh.length)
    useLibrary.setState((s) => ({
      playlists: s.playlists.map((p) =>
        p.id === existing.id
          ? { ...p, tracks: [...p.tracks, ...fresh], updatedAt: Date.now() }
          : p,
      ),
    }));
  return { added: fresh.length };
}
