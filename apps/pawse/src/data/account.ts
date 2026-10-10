import type { ArtistSummary, Track } from "@pawse/music-core";
import { yt, ytAccount } from "./clients";
import { onDislike, onLike, useLibrary } from "./library";
import { listeningStats, parsePlaylistId, strip } from "./library-model";
import { kv } from "./storage";

const MAX_PAGES = 50;
const SYNC_EVERY_MS = 6 * 3600_000;
const PAGE_GAP_MS = 400;
const LIKE_GAP_MS = 600;
const MIX_TTL_MS = 86400_000;
const MIX_KEY = "pawse.mixes.v1";
// Liked music and episodes are not real library playlists.
const SKIP_PLAYLISTS = new Set(["LM", "SE"]);

const signedIn = () => !!useLibrary.getState().settings.cookies;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bareId = (id: string) => (id.startsWith("VL") ? id.slice(2) : id);

/** Every page of a playlist (LM = liked songs), one request at a time. */
async function allTracks(
  id: string,
): Promise<{ title: string; tracks: Track[] }> {
  const first =
    id === "LM" ? await ytAccount.likedSongs() : await ytAccount.playlist(id);
  const tracks = [...first.tracks];
  let cont = first.continuation;
  for (let i = 0; cont && i < MAX_PAGES; i++) {
    await sleep(PAGE_GAP_MS);
    const page = await ytAccount.playlistMore(cont);
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
    const liked = (await allTracks("LM")).tracks;
    await sleep(PAGE_GAP_MS);
    const playlists = await ytAccount.libraryPlaylists();
    useLibrary.getState().applyRemote({ liked, playlists });
    return { liked: liked.length, playlists: playlists.length };
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}

/** Syncs when signed in and the last sync is over 6 hours old; the Library screen calls this. */
export async function maybeSyncLibrary(): Promise<boolean> {
  if (!signedIn() || syncing) return false;
  if (Date.now() - useLibrary.getState().syncedAt < SYNC_EVERY_MS) return false;
  await syncYouTubeLibrary();
  return true;
}

/** Creates a local playlist for a YouTube playlist, or refreshes the one imported before; returns its id. */
function upsertSourcePlaylist(
  sourceId: string,
  title: string,
  tracks: Track[],
): string {
  const existing = useLibrary
    .getState()
    .playlists.find((p) => p.sourceId === sourceId);
  if (existing) {
    useLibrary.setState((s) => ({
      playlists: s.playlists.map((p) =>
        p.id === existing.id
          ? { ...p, title, tracks: tracks.map(strip), updatedAt: Date.now() }
          : p,
      ),
    }));
    return existing.id;
  }
  const localId = useLibrary.getState().createPlaylist(title, tracks);
  useLibrary.setState((s) => ({
    playlists: s.playlists.map((p) =>
      p.id === localId ? { ...p, sourceId } : p,
    ),
  }));
  return localId;
}

/** Copies every page of a YouTube playlist into a local playlist (refreshing an earlier import); returns its id. */
export async function importPlaylist(urlOrId: string): Promise<string> {
  const id = parsePlaylistId(urlOrId);
  if (!id) throw new Error("Not a playlist link");
  const { title, tracks } = await allTracks(id);
  if (!tracks.length) throw new Error("Playlist is empty");
  return upsertSourcePlaylist(id, title || "Imported", tracks);
}

/** Copies the account's liked songs and library playlists into Pawse's own library, so they stay after sign-out. */
export async function importFromYouTubeAccount(
  onProgress?: (label: string) => void,
): Promise<{ liked: number; playlists: number }> {
  if (!signedIn()) throw new Error("Sign in to YouTube Music first");
  onProgress?.("Liked songs");
  const liked = (await allTracks("LM")).tracks;
  onProgress?.(`Liked songs ${liked.length}`);
  useLibrary.setState((s) => {
    const have = new Set(s.liked.map((t) => t.id));
    return {
      liked: [...s.liked, ...liked.filter((t) => !have.has(t.id)).map(strip)],
    };
  });
  await sleep(PAGE_GAP_MS);
  const lists = (await ytAccount.libraryPlaylists()).filter(
    (p) => !SKIP_PLAYLISTS.has(bareId(p.id)),
  );
  let playlists = 0;
  for (const [i, p] of lists.entries()) {
    onProgress?.(`Playlist ${i + 1} of ${lists.length}`);
    await sleep(PAGE_GAP_MS);
    try {
      const id = bareId(p.id);
      const { title, tracks } = await allTracks(id);
      if (!tracks.length) continue;
      upsertSourcePlaylist(id, title || p.title || "Imported", tracks);
      playlists++;
    } catch {
      // One unreadable playlist never stops the rest.
    }
  }
  return { liked: liked.length, playlists };
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

// Likes and dislikes mirror to YouTube one at a time; the latest toggle per song wins, failures stay local.
type Rating = "like" | "dislike" | "none";
const pendingRates = new Map<string, Rating>();
let rating = false;

async function drainRates(): Promise<void> {
  if (rating) return;
  rating = true;
  try {
    for (let next = pendingRates.entries().next(); !next.done; ) {
      const [id, value] = next.value;
      pendingRates.delete(id);
      await yt.rate(id, value).catch(() => {});
      await sleep(LIKE_GAP_MS);
      next = pendingRates.entries().next();
    }
  } finally {
    rating = false;
  }
}

/** Mirrors a follow to the YouTube account as a channel subscription, when signed in and syncing. */
export function mirrorFollow(channelId: string, on: boolean): void {
  const s = useLibrary.getState().settings;
  if (!s.cookies || !s.syncLikes) return;
  void ytAccount.subscribe(channelId, on).catch(() => {});
}

let started = false;
/** Registers the account write paths (like mirroring); reads only sync from maybeSyncLibrary. */
export function startAccountSync(): void {
  if (started) return;
  started = true;
  const mirror = (track: Track, value: Rating) => {
    const s = useLibrary.getState().settings;
    if (!s.cookies || !s.syncLikes || track.source !== "youtube") return;
    pendingRates.set(track.id, value);
    void drainRates();
  };
  onLike((track, on) => mirror(track, on ? "like" : "none"));
  onDislike((track, on) => mirror(track, on ? "dislike" : "none"));
}
