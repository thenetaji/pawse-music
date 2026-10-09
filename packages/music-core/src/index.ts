// Domain types and contracts shared by the catalog (@pawse/innertube), the player and the UI.
// Pure TypeScript: no React, no React Native.

export type SourceId = "youtube" | "saavn" | "local";

export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistRef {
  id?: string;
  name: string;
}

export interface AlbumRef {
  id: string;
  title: string;
}

/** A playable song or music video. `id` is the YouTube videoId for source 'youtube'. */
export interface Track {
  id: string;
  source: SourceId;
  title: string;
  artists: ArtistRef[];
  album?: AlbumRef;
  durationSec?: number;
  thumbnails: Thumbnail[];
  explicit?: boolean;
  /** 'song' = official audio (square art); 'video' = music video or user upload. */
  kind?: "song" | "video";
  /** YouTube's loudness offset in dB, used for normalisation once the stream is resolved. */
  loudnessDb?: number;
  /** Set when the track was liked or added from an album or playlist. */
  setVideoId?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  artists: ArtistRef[];
  year?: string;
  kind?: "album" | "single" | "ep";
  thumbnails: Thumbnail[];
}

export interface ArtistSummary {
  id: string;
  name: string;
  subtitle?: string;
  thumbnails: Thumbnail[];
}

export interface PlaylistSummary {
  id: string;
  title: string;
  author?: string;
  trackCount?: number;
  thumbnails: Thumbnail[];
}

export type CatalogItem =
  | ({ type: "track" } & Track)
  | ({ type: "album" } & AlbumSummary)
  | ({ type: "artist" } & ArtistSummary)
  | ({ type: "playlist" } & PlaylistSummary);

/** A titled row on home, artist or explore pages. */
export interface Shelf {
  title: string;
  subtitle?: string;
  items: CatalogItem[];
  /** Opaque token for "See all"; pass it to Catalog.browse. */
  more?: string;
}

export interface HomeFeed {
  chips: { title: string; params: string }[];
  shelves: Shelf[];
  continuation?: string;
}

/** A mood or genre tile. `params` is the opaque token for Catalog moodPage. */
export interface MoodTile {
  title: string;
  params: string;
  /** "#rrggbb" accent. */
  color?: string;
  /** Group title such as "Moods & moments" or "Genres". */
  section?: string;
}

export interface ExploreFeed {
  shelves: Shelf[];
  moods: MoodTile[];
}

export interface AlbumDetail extends AlbumSummary {
  description?: string;
  tracks: Track[];
  totalDurationSec?: number;
  /** Playlist id to start the album as a queue or radio. */
  playlistId?: string;
}

export interface ArtistDetail extends ArtistSummary {
  description?: string;
  subscribers?: string;
  /** Endless radio for the artist. */
  radioPlaylistId?: string;
  shufflePlaylistId?: string;
  shelves: Shelf[];
}

export interface PlaylistDetail extends PlaylistSummary {
  description?: string;
  tracks: Track[];
  continuation?: string;
}

export type SearchFilter =
  | "all"
  | "songs"
  | "videos"
  | "albums"
  | "artists"
  | "playlists";

export interface SearchResults {
  top?: CatalogItem;
  shelves: Shelf[];
  /** Present when a single filter was requested. */
  items?: CatalogItem[];
  continuation?: string;
}

/** Up-next / radio. `continuation` refills the queue when it runs low. */
export interface UpNext {
  tracks: Track[];
  playlistId?: string;
  continuation?: string;
  lyricsBrowseId?: string;
  relatedBrowseId?: string;
}

export interface LyricLine {
  startMs: number;
  endMs: number;
  text: string;
  /** Word timings when the source has them (karaoke sweep); otherwise the line sweeps evenly. */
  words?: { startMs: number; endMs: number; text: string }[];
}

export interface Lyrics {
  source:
    | "youlyplus"
    | "betterlyrics"
    | "lrclib"
    | "unison"
    | "kugou"
    | "youtube";
  synced: boolean;
  lines: LyricLine[];
  /** Plain text when unsynced. */
  plain?: string;
}

/** Read side of a music service. YouTube Music implements it in @pawse/innertube. */
export interface Catalog {
  home(params?: string): Promise<HomeFeed>;
  homeMore(continuation: string): Promise<HomeFeed>;
  search(query: string, filter?: SearchFilter): Promise<SearchResults>;
  suggestions(query: string): Promise<string[]>;
  album(id: string): Promise<AlbumDetail>;
  artist(id: string): Promise<ArtistDetail>;
  playlist(id: string): Promise<PlaylistDetail>;
  playlistMore(continuation: string): Promise<PlaylistDetail>;
  browse(token: string): Promise<Shelf[]>;
  /** Radio for a track (videoId) or a playlist; RDAMVM<id> under the hood. */
  upNext(input: {
    videoId?: string;
    playlistId?: string;
    continuation?: string;
  }): Promise<UpNext>;
}

/** Signed-in actions. All are optional until the user signs in. */
export interface Account {
  isSignedIn(): boolean;
  rate(videoId: string, rating: "like" | "dislike" | "none"): Promise<void>;
  likedSongs(): Promise<PlaylistDetail>;
  libraryPlaylists(): Promise<PlaylistSummary[]>;
  /** Reports a play to YouTube history so recommendations learn. */
  reportPlayback(
    videoId: string,
    playedSec: number,
    lengthSec: number,
  ): Promise<void>;
}

export interface ResolvedStream {
  url: string;
  mimeType: string;
  bitrate: number;
  contentLength?: number;
  /** Epoch ms. Re-resolve before this. */
  expiresAt: number;
  headers?: Record<string, string>;
  loudnessDb?: number;
  /** Real length of this audio, when the source says; players can misread it. */
  durationSec?: number;
  /** Which client or source produced it, for diagnostics. */
  via: string;
}

export class StreamError extends Error {
  constructor(
    public readonly code:
      | "unplayable"
      | "age_restricted"
      | "no_audio"
      | "network"
      | "blocked",
    message: string,
  ) {
    super(message);
    this.name = "StreamError";
  }
}

/** 'high' = best AAC (YouTube 140, Saavn 320), 'normal' = 140 / Saavn 160, 'saver' = 139 / Saavn 96. */
export type AudioQuality = "high" | "normal" | "saver";

export interface ResolveOptions {
  quality?: AudioQuality;
  /** Skip local downloads (used by the downloader itself). */
  remoteOnly?: boolean;
  /** `via` values whose streams failed for this track; never returned again. */
  exclude?: string[];
  /** `via` values that failed on this device; tried last. */
  avoid?: string[];
}

/** Turns a Track into a playable URL. Implementations try their own fallbacks. */
export interface StreamResolver {
  resolve(
    track: Pick<Track, "id" | "source" | "title" | "artists" | "durationSec">,
    options?: ResolveOptions,
  ): Promise<ResolvedStream>;
}

export interface LyricsProvider {
  lyrics(
    track: Pick<Track, "id" | "title" | "artists" | "album" | "durationSec">,
  ): Promise<Lyrics | null>;
}

/** Largest thumbnail, optionally rewritten to a target size for googleusercontent URLs. */
export function bestThumbnail(
  thumbnails: Thumbnail[],
  size?: number,
): string | undefined {
  if (!thumbnails.length) return undefined;
  const best = thumbnails.reduce((a, b) => (b.width > a.width ? b : a));
  if (size && /googleusercontent\.com/.test(best.url)) {
    return best.url.replace(/=w\d+-h\d+[^&]*$/, `=w${size}-h${size}-l90-rj`);
  }
  return best.url;
}

export function artistLine(artists: ArtistRef[]): string {
  return artists.map((a) => a.name).join(", ");
}
