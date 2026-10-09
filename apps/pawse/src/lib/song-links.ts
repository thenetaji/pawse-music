// Album and artist links for the playing song. Radio and video tracks often arrive without them,
// so they're looked up once by search and remembered for the session.
import type { AlbumRef, ArtistRef, Track } from "@pawse/music-core";

import { showSheet } from "../components/action-sheet";
import { yt } from "../data/clients";
import { MATCH_SCORE, scoreTrack } from "../data/import/score";
import { haptic } from "./haptics";
import { go } from "./nav";

const albums = new Map<string, AlbumRef | null>();
const artists = new Map<string, string | null>();

const same = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

/** The song's album, from the track itself or the best matching song on YouTube Music. */
export async function findAlbum(track: Track): Promise<AlbumRef | null> {
  if (track.album?.id) return track.album;
  if (albums.has(track.id)) return albums.get(track.id) ?? null;
  const artist = track.artists[0]?.name ?? "";
  const res = await yt.search(`${track.title} ${artist}`.trim(), "songs");
  const want = { title: track.title, artist, durationSec: track.durationSec };
  let best: { t: Track; s: number } | undefined;
  for (const it of res.items ?? []) {
    if (it.type !== "track" || !it.album?.id) continue;
    const s = scoreTrack(want, it);
    if (!best || s > best.s) best = { t: it, s };
  }
  const found = best && best.s >= MATCH_SCORE ? (best.t.album ?? null) : null;
  albums.set(track.id, found);
  return found;
}

/** The artist's channel ID, from the ref or an exact-name artist search. */
export async function findArtistId(ref: ArtistRef): Promise<string | null> {
  if (ref.id) return ref.id;
  if (artists.has(ref.name)) return artists.get(ref.name) ?? null;
  const res = await yt.search(ref.name, "artists");
  const hit = (res.items ?? []).find(
    (it) => it.type === "artist" && same(it.name, ref.name),
  );
  const id = hit?.type === "artist" ? hit.id : null;
  artists.set(ref.name, id);
  return id;
}

type Leave = (fn: () => void) => void;
const stay: Leave = (fn) => fn();

/** Opens the song's album, or its artist when the song has no album. */
export async function openAlbum(track: Track, leave: Leave = stay) {
  haptic.tick();
  const album = await findAlbum(track).catch(() => null);
  if (album) return leave(() => go(`/album/${album.id}`));
  return openArtist(track, leave);
}

/** Opens the artist page; with several artists, asks which one first. */
export async function openArtist(track: Track, leave: Leave = stay) {
  const open = async (ref: ArtistRef) => {
    const id = await findArtistId(ref).catch(() => null);
    if (id) leave(() => go(`/artist/${id}`));
    else haptic.error();
  };
  if (track.artists.length <= 1) {
    const only = track.artists[0];
    if (only) await open(only);
    return;
  }
  haptic.light();
  showSheet({
    actions: track.artists.map((a) => ({
      label: `Go to ${a.name}`,
      onPress: () => void open(a),
    })),
  });
}
