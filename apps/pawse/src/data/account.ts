import type { ArtistSummary, Track } from "@pawse/music-core";
import { desktop } from "../lib/desktop";
import { yt, ytAccount } from "./clients";
import { onDislike, onLike, useLibrary } from "./library";
import { listeningStats, parsePlaylistId, strip } from "./library-model";
import { kv } from "./storage";

const MAX_PAGES = 50;
// Every 6 to 9 hours, so syncs never land on a fixed clock.
const SYNC_EVERY_MS = (6 + Math.random() * 3) * 3600_000;
// The playlist list is one request, so it follows YouTube more closely: on opening Library or the app, at most every 10 min.
const PLAYLISTS_EVERY_MS = 10 * 60_000;
// A pull-to-refresh within this long of the last one reuses it.
const PULL_GAP_MS = 30_000;
const PAGE_GAP_MS = 400;
// Likes and follows reach YouTube 2.5 to 4.5 s apart, 40 an hour at most; the rest wait their turn.
const WRITE_GAP_MS = 2500;
const WRITE_JITTER_MS = 2000;
const WRITES_PER_HOUR = 40;
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
let listing: Promise<void> | undefined;
let playlistsAt = 0;

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
    playlistsAt = Date.now();
    return { liked: liked.length, playlists: playlists.length };
  })().finally(() => {
    syncing = undefined;
  });
  return syncing;
}

/** Re-reads only the account's playlist list (one request), so a playlist made on YouTube shows up. */
function refreshYouTubePlaylists(): Promise<void> {
  // Counted from the attempt, so a refused request isn't retried on every visit.
  playlistsAt = Date.now();
  listing ??= ytAccount
    .libraryPlaylists()
    .then((playlists) => useLibrary.getState().applyRemote({ playlists }))
    .finally(() => {
      listing = undefined;
    });
  return listing;
}

/** Full sync when the last is over 6 hours old, else the playlist list when it is over 10 min old; Library calls this on focus. */
export async function maybeSyncLibrary(): Promise<boolean> {
  if (!signedIn() || syncing || listing) return false;
  const now = Date.now();
  if (now - useLibrary.getState().syncedAt >= SYNC_EVERY_MS)
    await syncYouTubeLibrary();
  else if (now - playlistsAt >= PLAYLISTS_EVERY_MS)
    await refreshYouTubePlaylists();
  else return false;
  return true;
}

/** Pull-to-refresh on Library: likes and playlists now, unless that just happened. */
export async function refreshLibrary(): Promise<void> {
  if (!signedIn()) return;
  if (syncing) return void (await syncing);
  if (Date.now() - useLibrary.getState().syncedAt < PULL_GAP_MS) return;
  await syncYouTubeLibrary();
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

// Likes, dislikes and follows mirror to YouTube one at a time; the latest change per song or artist wins, failures stay local.
type Rating = "like" | "dislike" | "none";
const pendingWrites = new Map<string, () => Promise<unknown>>();
const recentWrites: number[] = [];
let writing = false;

async function drainWrites(): Promise<void> {
  if (writing) return;
  writing = true;
  try {
    for (let next = pendingWrites.entries().next(); !next.done; ) {
      const hourAgo = Date.now() - 3600_000;
      while (recentWrites.length && recentWrites[0] < hourAgo)
        recentWrites.shift();
      if (recentWrites.length >= WRITES_PER_HOUR) {
        await sleep(recentWrites[0] - hourAgo + 1000);
        continue;
      }
      const [key, write] = next.value;
      pendingWrites.delete(key);
      recentWrites.push(Date.now());
      await write().catch(() => {});
      await sleep(WRITE_GAP_MS + Math.random() * WRITE_JITTER_MS);
      next = pendingWrites.entries().next();
    }
  } finally {
    writing = false;
  }
}

function queueWrite(key: string, write: () => Promise<unknown>): void {
  pendingWrites.delete(key);
  pendingWrites.set(key, write);
  void drainWrites();
}

/** Mirrors a follow to the YouTube account as a channel subscription, when signed in and syncing. */
export function mirrorFollow(channelId: string, on: boolean): void {
  const s = useLibrary.getState().settings;
  if (!s.cookies || !s.syncLikes) return;
  queueWrite(`follow:${channelId}`, () => ytAccount.subscribe(channelId, on));
}

// Playlist edits wait in the same queue as likes; the count moves at once and moves back if YouTube refuses.
let editSeq = 0;
const NOT_SIGNED_IN = "Sign in to YouTube Music to edit playlists";
function bumpCount(playlistId: string, delta: number): void {
  const id = bareId(playlistId);
  useLibrary.setState((s) => ({
    ytPlaylists: s.ytPlaylists.map((p) =>
      bareId(p.id) === id && p.trackCount !== undefined
        ? { ...p, trackCount: Math.max(0, p.trackCount + delta) }
        : p,
    ),
  }));
}

function queuePlaylistEdit(
  playlistId: string,
  delta: number,
  send: () => Promise<void>,
): Promise<void> {
  bumpCount(playlistId, delta);
  const done = new Promise<void>((resolve, reject) => {
    queueWrite(`playlist:${bareId(playlistId)}:${editSeq++}`, async () => {
      try {
        await send();
        resolve();
      } catch (e) {
        bumpCount(playlistId, -delta);
        reject(e);
      }
    });
  });
  // The caller may not await it; a refused edit must not surface as an unhandled rejection.
  done.catch(() => {});
  return done;
}

/** Adds YouTube tracks to one of the account's playlists; resolves once YouTube accepted it, rejects if it refused. */
export async function addToYouTubePlaylist(
  playlistId: string,
  tracks: Track[],
): Promise<void> {
  const ids = [
    ...new Set(tracks.filter((t) => t.source === "youtube").map((t) => t.id)),
  ];
  if (!signedIn()) throw new Error(NOT_SIGNED_IN);
  if (!ids.length) return;
  return queuePlaylistEdit(playlistId, ids.length, () =>
    ytAccount.addToPlaylist(bareId(playlistId), ids),
  );
}

/** Removes tracks from one of the account's playlists; only tracks that carry a setVideoId (from the playlist page) can go. */
export async function removeFromYouTubePlaylist(
  playlistId: string,
  tracks: Track[],
): Promise<void> {
  const items = tracks.flatMap((t) =>
    t.source === "youtube" && t.setVideoId
      ? [{ videoId: t.id, setVideoId: t.setVideoId }]
      : [],
  );
  if (!signedIn()) throw new Error(NOT_SIGNED_IN);
  if (!items.length) return;
  return queuePlaylistEdit(playlistId, -items.length, () =>
    ytAccount.removeFromPlaylist(bareId(playlistId), items),
  );
}

let started = false;
/** Registers the account write paths (like mirroring); reads only sync from maybeSyncLibrary. */
export function startAccountSync(): void {
  if (started) return;
  started = true;
  const mirror = (track: Track, value: Rating) => {
    const s = useLibrary.getState().settings;
    if (!s.cookies || !s.syncLikes || track.source !== "youtube") return;
    queueWrite(`rate:${track.id}`, () => yt.rate(track.id, value));
  };
  onLike((track, on) => mirror(track, on ? "like" : "none"));
  onDislike((track, on) => mirror(track, on ? "dislike" : "none"));
  // A Firefox sign-in follows Google's cookie refreshes while the desktop app runs.
  desktop?.onSession((cookies) => {
    if (useLibrary.getState().settings.cookies)
      useLibrary.getState().setSettings({ cookies });
  });
}
