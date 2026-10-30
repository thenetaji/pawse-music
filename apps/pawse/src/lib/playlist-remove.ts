// Taking songs out of a playlist: the row goes at once and an Undo toast offers it back for a few seconds. A YouTube playlist is only told once that window has passed.
import type { Track } from "@pawse/music-core";
import { create } from "zustand";

import { showToast } from "../components/toast";
import { removeFromYouTubePlaylist } from "../data/account";
import { reinsertTracks, useLibrary } from "../data/library";
import { haptic } from "./haptics";
import { count } from "./plural";
import { refreshResources } from "./use-resource";

const UNDO_MS = 5000;

/** A song picked for removal, with its position in the list it leaves. */
export type Picked = { track: Track; at: number };

const bare = (id: string) => (id.startsWith("VL") ? id.slice(2) : id);

function offerUndo(picks: Picked[], undo: () => void) {
  haptic.success();
  showToast(
    picks.length === 1
      ? `Removed “${picks[0].track.title}”`
      : `Removed ${count(picks.length, "song")}`,
    { ms: UNDO_MS, action: { label: "Undo", onPress: undo } },
  );
}

/** Removes songs from a Pawse playlist. */
export function removeFromLocalPlaylist(id: string, picks: Picked[]) {
  useLibrary.getState().removeManyFromPlaylist(
    id,
    picks.map((p) => p.track.id),
  );
  offerUndo(picks, () => {
    haptic.light();
    useLibrary.getState().restoreToPlaylist(id, picks);
  });
}

/** Unlikes songs, which also takes them off the YouTube account's likes when it syncs them. */
export function removeFromLiked(picks: Picked[]) {
  const ids = new Set(picks.map((p) => p.track.id));
  for (const { track } of picks)
    if (useLibrary.getState().isLiked(track.id))
      useLibrary.getState().toggleLike(track);
  offerUndo(picks, () => {
    haptic.light();
    for (const { track } of picks)
      if (!useLibrary.getState().isLiked(track.id))
        useLibrary.getState().toggleLike(track);
    // Liking puts a song first; Undo puts it back where it was.
    useLibrary.setState((s) => ({
      liked: reinsertTracks(
        s.liked.filter((t) => !ids.has(t.id)),
        picks,
      ),
    }));
  });
}

// Entries (by setVideoId) taken out of a YouTube playlist page, hidden from it until YouTube answers. A confirmed one stays hidden, since the page copy kept for a while still lists it.
const useGone = create<{ gone: Record<string, string[]> }>(() => ({
  gone: {},
}));
const NONE: string[] = [];

/** The setVideoIds to hide from a YouTube playlist page. */
export const useRemovedFromYouTube = (playlistId: string): string[] =>
  useGone((s) => s.gone[bare(playlistId)] ?? NONE);

const hide = (id: string, ids: string[]) =>
  useGone.setState((s) => ({
    gone: { ...s.gone, [id]: [...(s.gone[id] ?? []), ...ids] },
  }));
const unhide = (id: string, ids: string[]) =>
  useGone.setState((s) => ({
    gone: {
      ...s.gone,
      [id]: (s.gone[id] ?? []).filter((x) => !ids.includes(x)),
    },
  }));

/** Removes songs from a YouTube Music playlist the account owns; they come back with an error if YouTube refuses. */
export function removeFromYouTubePlaylistWithUndo(
  playlistId: string,
  all: Picked[],
) {
  const id = bare(playlistId);
  // YouTube removes an entry by the setVideoId its row came with.
  const picks = all.filter((p) => p.track.setVideoId);
  if (!picks.length)
    return showToast("These songs can't be removed from here", { bad: true });
  const tracks = picks.map((p) => p.track);
  const ids = tracks.flatMap((t) => (t.setVideoId ? [t.setVideoId] : []));
  hide(id, ids);
  const timer = setTimeout(() => {
    removeFromYouTubePlaylist(id, tracks).then(
      // The cached page still counts them; read it again.
      () => void refreshResources([`playlist:${id}`, `playlist:VL${id}`]),
      () => {
        unhide(id, ids);
        haptic.error();
        const what = tracks.length === 1 ? "the song" : "the songs";
        showToast(`YouTube didn't remove ${what}. Try again later.`, {
          bad: true,
        });
      },
    );
  }, UNDO_MS);
  offerUndo(picks, () => {
    haptic.light();
    clearTimeout(timer);
    unhide(id, ids);
  });
}
