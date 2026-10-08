import type { ArtistSummary, Track } from "@studio/music-core";
import { AppState } from "react-native";

import { yt } from "./clients";
import { onLike, useLibrary } from "./library";
import { listeningStats, parsePlaylistId } from "./library-model";
import { kv } from "./storage";

const MAX_PAGES = 50;
const SYNC_EVERY_MS = 30 * 60_000;
const MIX_TTL_MS = 86400_000;
const MIX_KEY = "flow.mixes.v1";

const signedIn = () => !!useLibrary.getState().settings.cookies;

async function allTracks(
  id: string,
): Promise<{ title: string; tracks: Track[] }> {
  const first = id === "LM" ? await yt.likedSongs() : await yt.playlist(id);
  const tracks = [...first.tracks];
  let cont = first.continuation;
  for (let i = 0; cont && i < MAX_PAGES; i++) {
    const page = await yt.playlistMore(cont);
    tracks.push(...page.tracks);
    cont = page.continuation;
  }
  const seen = new Set<string>();
  return {
    title: first.title,
    tracks: tracks.filter((t) => !seen.has(t.id) && !!seen.add(t.id)),
  };
}

let syncing: Promise<{ liked: number; playlists: number }> | undefined;

/** Pulls YouTube Music liked songs and library playlists into the store; no-op when signed out. */
export function syncYouTubeLibrary(): Promise<{
  liked: number;
  playlists: number;
}> {
  if (!signedIn()) return Promise.resolve({ liked: 0, playlists: 0 });
  syncing ??= (async () => {
    const [liked, playlists] = await Promise.all([
      allTracks("LM").then((r) => r.tracks),
      yt.libraryPlaylists(),
    ]);
    useLibrary.getState().applyRemote({ liked, playlists });
    return { liked: liked.length, playlists: playlists.length };
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}

/** Copies every page of a YouTube playlist into a new local playlist; returns its id. */
export async function importPlaylist(urlOrId: string): Promise<string> {
  const id = parsePlaylistId(urlOrId);
  if (!id) throw new Error("Not a playlist link");
  const { title, tracks } = await allTracks(id);
  if (!tracks.length) throw new Error("Playlist is empty");
  const lib = useLibrary.getState();
  const localId = lib.createPlaylist(title || "Imported", tracks);
  useLibrary.setState((s) => ({
    playlists: s.playlists.map((p) =>
      p.id === localId ? { ...p, sourceId: id } : p,
    ),
  }));
  return localId;
}

export type DailyMix = { artist: ArtistSummary; playlistId: string };
type MixCache = Record<
  string,
  { at: number; artist: ArtistSummary; playlistId?: string }
>;

/** Up to 6 artist radios from your top artists of the last 30 days, then onboarding seeds. */
export async function dailyMixes(): Promise<DailyMix[]> {
  const { history, settings } = useLibrary.getState();
  const top = listeningStats(
    history,
    Date.now() - 30 * 86400_000,
    Date.now(),
    20,
  )
    .topArtists.map((a) => a.artist)
    .filter((a): a is { id: string; name: string } => !!a.id);
  const ids = [
    ...new Set([
      ...top.map((a) => a.id),
      ...settings.seedArtists.map((a) => a.id),
    ]),
  ].slice(0, 6);
  let cache: MixCache = {};
  try {
    cache = JSON.parse((await kv.get(MIX_KEY)) ?? "{}") as MixCache;
  } catch {
    cache = {};
  }
  const now = Date.now();
  const rows = await Promise.allSettled(
    ids.map(async (id) => {
      const hit = cache[id];
      if (hit && now - hit.at < MIX_TTL_MS) return hit;
      const a = await yt.artist(id);
      const entry = {
        at: now,
        artist: {
          id,
          name: a.name,
          subtitle: a.subtitle,
          thumbnails: a.thumbnails,
        },
        playlistId: a.radioPlaylistId,
      };
      cache[id] = entry;
      return entry;
    }),
  );
  void kv.set(MIX_KEY, JSON.stringify(cache)).catch(() => {});
  return rows.flatMap((r) =>
    r.status === "fulfilled" && r.value.playlistId
      ? [{ artist: r.value.artist, playlistId: r.value.playlistId }]
      : [],
  );
}

// Likes mirror to YouTube when signed in; failures stay local.
onLike((track, on) => {
  const s = useLibrary.getState().settings;
  if (!s.cookies || !s.syncLikes || track.source !== "youtube") return;
  void yt.rate(track.id, on ? "like" : "none").catch(() => {});
});

let started = false;
/** Syncs once the app is in the foreground (never from a headless start), at most every 30 min. */
export function startAccountSync(): void {
  if (started) return;
  started = true;
  const run = () => {
    if (Date.now() - useLibrary.getState().syncedAt > SYNC_EVERY_MS)
      void syncYouTubeLibrary().catch(() => {});
  };
  if (AppState.currentState === "active") run();
  AppState.addEventListener("change", (st) => st === "active" && run());
}
