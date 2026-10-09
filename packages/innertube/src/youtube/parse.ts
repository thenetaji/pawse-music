import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistRef,
  ArtistSummary,
  CatalogItem,
  HomeFeed,
  PlaylistDetail,
  PlaylistSummary,
  SearchFilter,
  SearchResults,
  Shelf,
  Thumbnail,
  Track,
  UpNext,
} from "@studio/music-core";

import {
  albumFrom,
  arr,
  artistsFrom,
  browseOf,
  continuationOf,
  dig,
  durationFrom,
  groups,
  isExplicit,
  type Node,
  obj,
  parseDuration,
  type Run,
  runs,
  TYPE_LABELS,
  text,
  thumbnails,
  tokenOfItem,
  unwrap,
  watchOf,
  yearFrom,
} from "./nodes";

/** Fills gaps in tracks/albums from their page (album artists, art). */
export interface ItemDefaults {
  artists?: ArtistRef[];
  album?: { id: string; title: string };
  thumbnails?: Thumbnail[];
}

const ATV = "MUSIC_VIDEO_TYPE_ATV";
const kindOf = (videoType: string | undefined): Track["kind"] =>
  videoType === ATV ? "song" : "video";
const stripVL = (id: string) => (id.startsWith("VL") ? id.slice(2) : id);
const typeLabel = (rs: Run[]): string | undefined => {
  const first = groups(rs)[0];
  const t = first
    ?.map((r) => r.text)
    .join("")
    .trim();
  return t && TYPE_LABELS.has(t) ? t : undefined;
};
const albumKind = (label: string | undefined): AlbumSummary["kind"] =>
  label === "Single"
    ? "single"
    : label === "EP"
      ? "ep"
      : label === "Album"
        ? "album"
        : undefined;
const countFrom = (s: string): number | undefined => {
  const m = s.match(/([\d,.]+)\s+(songs?|tracks?|videos?|episodes?)/i);
  return m ? Number(m[1].replace(/[,.]/g, "")) : undefined;
};
const subtitleText = (rs: Run[]): string | undefined => {
  const label = typeLabel(rs);
  const gs = groups(rs).map((g) =>
    g
      .map((r) => r.text)
      .join("")
      .trim(),
  );
  const rest = label ? gs.slice(1) : gs;
  return rest.length ? rest.join(" • ") : undefined;
};

/** Encodes a browse endpoint as the opaque `Shelf.more` token. */
export const encodeBrowse = (browseId: string, params?: string) =>
  params ? `${browseId}|${params}` : browseId;

function track(
  base: {
    videoId: string;
    title: string;
    videoType?: string;
    sub: Run[];
    thumbs: Thumbnail[];
    duration?: number;
    explicit: boolean;
    setVideoId?: string;
  },
  d: ItemDefaults = {},
): { type: "track" } & Track {
  const artists = artistsFrom(base.sub);
  return {
    type: "track",
    id: base.videoId,
    source: "youtube",
    title: base.title,
    artists: artists.length ? artists : (d.artists ?? []),
    album: albumFrom(base.sub) ?? d.album,
    durationSec: base.duration ?? durationFrom(base.sub),
    thumbnails: base.thumbs.length ? base.thumbs : (d.thumbnails ?? []),
    explicit: base.explicit || undefined,
    kind: kindOf(base.videoType),
    setVideoId: base.setVideoId,
  };
}

function fromBrowse(
  b: { browseId?: string; pageType?: string },
  title: string,
  sub: Run[],
  thumbs: Thumbnail[],
  d: ItemDefaults,
): CatalogItem | undefined {
  if (!b.browseId) return undefined;
  switch (b.pageType) {
    case "MUSIC_PAGE_TYPE_ALBUM":
    case "MUSIC_PAGE_TYPE_AUDIOBOOK": {
      const artists = artistsFrom(sub);
      return {
        type: "album",
        id: b.browseId,
        title,
        artists: artists.length ? artists : (d.artists ?? []),
        year: yearFrom(sub),
        kind: albumKind(typeLabel(sub)),
        thumbnails: thumbs,
      };
    }
    case "MUSIC_PAGE_TYPE_ARTIST":
      return {
        type: "artist",
        id: b.browseId,
        name: title,
        subtitle: subtitleText(sub),
        thumbnails: thumbs,
      };
    case "MUSIC_PAGE_TYPE_PLAYLIST": {
      // Unlabelled subtitles on home cards list featured artists, not the owner.
      const linked = sub.find(
        (r) => browseOf(r.navigationEndpoint).browseId,
      )?.text;
      const author =
        linked ??
        (typeLabel(sub) === "Playlist" ? artistsFrom(sub)[0]?.name : undefined);
      return {
        type: "playlist",
        id: stripVL(b.browseId),
        title,
        author,
        trackCount: countFrom(sub.map((r) => r.text).join("")),
        thumbnails: thumbs,
      };
    }
    default:
      return undefined;
  }
}

/** musicResponsiveListItemRenderer: search rows, album and playlist tracks, artist top songs. */
export function fromListItem(
  r: Node,
  d: ItemDefaults = {},
): CatalogItem | undefined {
  const cols = arr(r.flexColumns).map((c) =>
    dig(c, "musicResponsiveListItemFlexColumnRenderer", "text"),
  );
  const title = text(cols[0]).trim();
  const titleRuns = runs(cols[0]);
  const sub: Run[] = [];
  for (const c of cols.slice(1)) {
    const rs = runs(c);
    if (!rs.length) continue;
    if (sub.length) sub.push({ text: " • " });
    sub.push(...rs);
  }
  const label = typeLabel(sub);
  if (label === "Episode" || label === "Podcast" || label === "Profile")
    return undefined;
  const thumbs = thumbnails(r.thumbnail);
  const b = browseOf(r.navigationEndpoint);
  const fromNav = fromBrowse(b, title, sub, thumbs, d);
  if (fromNav) return fromNav;
  const w = watchOf(titleRuns[0]?.navigationEndpoint);
  const videoId = w.videoId ?? dig(r, "playlistItemData", "videoId");
  if (typeof videoId !== "string" || !title) return undefined;
  const fixed = arr(r.fixedColumns).map((c) =>
    text(dig(c, "musicResponsiveListItemFixedColumnRenderer", "text")),
  );
  return track(
    {
      videoId,
      title,
      videoType: w.videoType,
      sub,
      thumbs,
      duration: fixed.map(parseDuration).find((x) => x !== undefined),
      explicit: isExplicit(r.badges, r.subtitleBadges),
      setVideoId: dig(r, "playlistItemData", "playlistSetVideoId"),
    },
    d,
  );
}

/** musicTwoRowItemRenderer: carousels and grids. */
export function fromTwoRowItem(
  r: Node,
  d: ItemDefaults = {},
): CatalogItem | undefined {
  const title = text(r.title).trim();
  const nav = r.navigationEndpoint ?? runs(r.title)[0]?.navigationEndpoint;
  const sub = runs(r.subtitle);
  const thumbs = thumbnails(r.thumbnailRenderer);
  const fromNav = fromBrowse(browseOf(nav), title, sub, thumbs, d);
  if (fromNav) return fromNav;
  const w = watchOf(nav);
  if (!w.videoId || !title) return undefined;
  return track(
    {
      videoId: w.videoId,
      title,
      videoType: w.videoType,
      sub,
      thumbs,
      explicit: isExplicit(r.subtitleBadges),
    },
    d,
  );
}

/** playlistPanelVideoRenderer: the up-next queue. */
export function fromPanelVideo(r: Node): Track | undefined {
  const videoId = r.videoId ?? watchOf(r.navigationEndpoint).videoId;
  const title = text(r.title).trim();
  if (typeof videoId !== "string" || !title) return undefined;
  const { type: _type, ...t } = track({
    videoId,
    title,
    videoType: watchOf(r.navigationEndpoint).videoType,
    sub: runs(r.longBylineText).length
      ? runs(r.longBylineText)
      : runs(r.shortBylineText),
    thumbs: thumbnails(r.thumbnail),
    duration: parseDuration(text(r.lengthText)),
    explicit: isExplicit(r.badges),
  });
  return t;
}

export function parseItem(
  v: unknown,
  d: ItemDefaults = {},
): CatalogItem | undefined {
  const u = unwrap(v);
  if (!u) return undefined;
  if (u.key === "musicResponsiveListItemRenderer")
    return fromListItem(u.node, d);
  if (u.key === "musicTwoRowItemRenderer") return fromTwoRowItem(u.node, d);
  if (u.key === "playlistPanelVideoRenderer") {
    const t = fromPanelVideo(u.node);
    return t && { type: "track", ...t };
  }
  return undefined;
}

const items = (list: unknown, d?: ItemDefaults): CatalogItem[] =>
  arr(list)
    .map((x) => parseItem(x, d))
    .filter((x): x is CatalogItem => !!x);

export const tracksOf = (list: unknown, d?: ItemDefaults): Track[] =>
  items(list, d)
    .filter((x) => x.type === "track")
    .map(({ type: _type, ...t }) => t as Track);

function moreToken(nav: unknown): string | undefined {
  const b = browseOf(nav);
  if (b.browseId) return encodeBrowse(b.browseId, b.params);
  const s = obj(dig(nav, "searchEndpoint"));
  return s?.query ? `search|${s.query}|${s.params ?? ""}` : undefined;
}

/** One shelf-like section, or undefined for headers, chips and description blocks. */
export function parseShelf(v: unknown, d?: ItemDefaults): Shelf | undefined {
  const u = unwrap(v);
  if (!u) return undefined;
  const n = u.node;
  switch (u.key) {
    case "musicCarouselShelfRenderer":
    case "musicImmersiveCarouselShelfRenderer": {
      const h = unwrap(n.header)?.node ?? {};
      const title = text(h.title);
      return {
        title,
        subtitle: text(h.strapline) || undefined,
        items: items(n.contents, d),
        more:
          moreToken(
            dig(h, "moreContentButton", "buttonRenderer", "navigationEndpoint"),
          ) ?? moreToken(runs(h.title)[0]?.navigationEndpoint),
      };
    }
    case "musicShelfRenderer":
    case "musicPlaylistShelfRenderer":
      return {
        title: text(n.title),
        items: items(n.contents, d),
        more:
          moreToken(n.bottomEndpoint) ??
          moreToken(runs(n.title)[0]?.navigationEndpoint),
      };
    case "gridRenderer":
      return {
        title: text(dig(n, "header", "gridHeaderRenderer", "title")),
        items: items(n.items, d),
      };
    default:
      return undefined;
  }
}

export function parseSectionList(contents: unknown, d?: ItemDefaults): Shelf[] {
  const out: Shelf[] = [];
  for (const c of arr(contents)) {
    const inner = dig(c, "itemSectionRenderer", "contents");
    if (inner) {
      out.push(...parseSectionList(inner, d));
      continue;
    }
    const s = parseShelf(c, d);
    if (s && s.items.length) out.push(s);
  }
  return out;
}

export const tab0 = (j: unknown) =>
  dig(
    j,
    "contents",
    "singleColumnBrowseResultsRenderer",
    "tabs",
    0,
    "tabRenderer",
    "content",
    "sectionListRenderer",
  );
const twoCol = (j: unknown) =>
  dig(j, "contents", "twoColumnBrowseResultsRenderer");

export function parseHome(json: unknown): HomeFeed {
  const appended = arr(dig(json, "onResponseReceivedActions")).flatMap((x) =>
    arr(dig(x, "appendContinuationItemsAction", "continuationItems")),
  );
  const sl =
    tab0(json) ??
    dig(json, "continuationContents", "sectionListContinuation") ??
    (appended.length ? { contents: appended } : undefined);
  const chips = arr(dig(sl, "header", "chipCloudRenderer", "chips"))
    .map((c) => {
      const chip = dig(c, "chipCloudChipRenderer");
      return {
        title: text(chip?.text),
        params: browseOf(chip?.navigationEndpoint).params ?? "",
      };
    })
    .filter((c) => c.title && c.params);
  return {
    chips,
    shelves: parseSectionList(dig(sl, "contents")),
    continuation: continuationOf(sl),
  };
}

const SHELF_TITLE: Record<string, string> = {
  songs: "Songs",
  videos: "Videos",
  albums: "Albums",
  artists: "Artists",
  playlists: "Playlists",
};
const filterOfItem = (it: CatalogItem): SearchFilter =>
  it.type === "track"
    ? it.kind === "song"
      ? "songs"
      : "videos"
    : it.type === "album"
      ? "albums"
      : it.type === "artist"
        ? "artists"
        : "playlists";

function topResult(card: Node): CatalogItem | undefined {
  const title = text(card.title).trim();
  const nav = runs(card.title)[0]?.navigationEndpoint ?? card.onTap;
  const sub = runs(card.subtitle);
  const thumbs = thumbnails(card.thumbnail);
  const fromNav = fromBrowse(browseOf(nav), title, sub, thumbs, {});
  if (fromNav) return fromNav;
  const w = watchOf(nav);
  if (!w.videoId || !title) return undefined;
  return track({
    videoId: w.videoId,
    title,
    videoType: w.videoType,
    sub,
    thumbs,
    explicit: isExplicit(card.subtitleBadges),
  });
}

export function parseSearch(
  json: unknown,
  filter: SearchFilter = "all",
): SearchResults {
  const cont = dig(json, "continuationContents", "musicShelfContinuation");
  if (cont)
    return {
      shelves: [],
      items: items(cont.contents),
      continuation: continuationOf(cont),
    };
  const sections = arr(
    dig(
      json,
      "contents",
      "tabbedSearchResultsRenderer",
      "tabs",
      0,
      "tabRenderer",
      "content",
      "sectionListRenderer",
      "contents",
    ),
  );
  if (filter !== "all") {
    const shelf = sections
      .map((s) => dig(s, "musicShelfRenderer"))
      .find(Boolean);
    return {
      shelves: [],
      items: items(shelf?.contents),
      continuation: continuationOf(shelf),
    };
  }
  const card = sections
    .map((s) => dig(s, "musicCardShelfRenderer"))
    .find(Boolean);
  const top = card ? topResult(card) : undefined;
  const titled: Shelf[] = [];
  const loose: CatalogItem[] = [];
  for (const s of sections) {
    const shelf = dig(s, "musicShelfRenderer");
    if (shelf) {
      const parsed = parseShelf(s);
      if (parsed?.items.length) titled.push(parsed);
    }
    for (const it of arr(dig(s, "itemSectionRenderer", "contents"))) {
      const parsed = parseItem(it);
      if (parsed) loose.push(parsed);
    }
  }
  // 2026 layout: a flat list of typed rows instead of titled shelves; regroup by type.
  const grouped = new Map<SearchFilter, CatalogItem[]>();
  for (const it of loose) {
    const f = filterOfItem(it);
    grouped.set(f, [...(grouped.get(f) ?? []), it]);
  }
  const shelves = [
    ...titled,
    ...[...grouped].map(([f, list]) => ({
      title: SHELF_TITLE[f],
      items: list,
    })),
  ];
  return { top, shelves };
}

export function parseSuggestions(json: unknown): string[] {
  const out: string[] = [];
  for (const section of arr(dig(json, "contents"))) {
    for (const c of arr(
      dig(section, "searchSuggestionsSectionRenderer", "contents"),
    )) {
      const s = dig(c, "searchSuggestionRenderer");
      const q =
        dig(s, "navigationEndpoint", "searchEndpoint", "query") ??
        text(s?.suggestion);
      if (q) out.push(q);
    }
  }
  return out;
}

function pageHeader(json: unknown): Node | undefined {
  const first = dig(
    twoCol(json),
    "tabs",
    0,
    "tabRenderer",
    "content",
    "sectionListRenderer",
    "contents",
    0,
  );
  for (const cand of [first, dig(json, "header")]) {
    let u = unwrap(cand);
    if (u?.key === "musicEditablePlaylistDetailHeaderRenderer")
      u = unwrap(u.node.header);
    if (u && /Header/.test(u.key)) return u.node;
  }
  return undefined;
}

const descriptionOf = (h: Node | undefined): string | undefined =>
  text(dig(h, "description", "musicDescriptionShelfRenderer", "description")) ||
  text(h?.description) ||
  undefined;

/** Track list container on album/playlist pages (two-column, then legacy single-column). */
function trackShelf(json: unknown): Node | undefined {
  for (const list of [
    dig(twoCol(json), "secondaryContents", "sectionListRenderer", "contents"),
    dig(tab0(json), "contents"),
  ]) {
    for (const c of arr(list)) {
      const s =
        dig(c, "musicPlaylistShelfRenderer") ?? dig(c, "musicShelfRenderer");
      if (s) return s;
    }
  }
  return undefined;
}

export function parseAlbum(json: unknown, id: string): AlbumDetail {
  const h = pageHeader(json);
  const sub = runs(h?.subtitle);
  const strap = artistsFrom(runs(h?.straplineTextOne));
  const artists = strap.length ? strap : artistsFrom(sub);
  const title = text(h?.title);
  const thumbs = thumbnails(h?.thumbnail).length
    ? thumbnails(h?.thumbnail)
    : thumbnails(dig(json, "background"));
  const tracks = tracksOf(trackShelf(json)?.contents, {
    artists,
    album: { id, title },
    thumbnails: thumbs,
  });
  const canonical = String(
    dig(json, "microformat", "microformatDataRenderer", "urlCanonical") ?? "",
  );
  const playlistId =
    canonical.match(/[?&]list=([\w-]+)/)?.[1] ??
    JSON.stringify([
      h?.buttons ?? [],
      trackShelf(json)?.contents?.[0] ?? {},
    ]).match(/"playlistId":"(OLAK[\w-]+)"/)?.[1];
  const total = tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0);
  return {
    id,
    title,
    artists,
    year: yearFrom(sub),
    kind: albumKind(typeLabel(sub)) ?? "album",
    thumbnails: thumbs,
    description: descriptionOf(h),
    tracks,
    totalDurationSec: total || undefined,
    playlistId,
  };
}

/** Album browse id referenced by an OLAK playlist page (its tracks link back to the album). */
export function albumIdFromPlaylist(json: unknown): string | undefined {
  return JSON.stringify(dig(trackShelf(json), "contents") ?? []).match(
    /"browseId":"(MPREb_[\w-]+)"/,
  )?.[1];
}

export function parseArtist(json: unknown, id: string): ArtistDetail {
  const h = pageHeader(json) ?? {};
  const name = text(h.title);
  const sections = arr(dig(tab0(json), "contents"));
  const self: ArtistRef[] = [{ id, name }];
  const buttons = [h.startRadioButton, h.playButton, ...arr(h.buttons)]
    .map((b) => dig(b, "buttonRenderer"))
    .filter(Boolean);
  let radioPlaylistId: string | undefined;
  let shufflePlaylistId: string | undefined;
  for (const b of buttons) {
    const pid = watchOf(b.navigationEndpoint).playlistId;
    if (!pid) continue;
    const icon = dig(b, "icon", "iconType");
    if ((icon === "MIX" || pid.startsWith("RDEM")) && !radioPlaylistId)
      radioPlaylistId = pid;
    else if (
      (icon === "MUSIC_SHUFFLE" || pid.startsWith("RDAO")) &&
      !shufflePlaylistId
    )
      shufflePlaylistId = pid;
  }
  const descShelf = sections
    .map((s) => dig(s, "musicDescriptionShelfRenderer"))
    .find(Boolean);
  return {
    id,
    name,
    subtitle: text(h.monthlyListenerCount) || undefined,
    subscribers:
      text(
        dig(
          h,
          "subscriptionButton",
          "subscribeButtonRenderer",
          "subscriberCountText",
        ),
      ) ||
      text(
        dig(
          h,
          "subscriptionButton",
          "subscribeButtonRenderer",
          "longSubscriberCountText",
        ),
      ) ||
      undefined,
    thumbnails: thumbnails(h.thumbnail),
    description:
      text(h.description) || text(descShelf?.description) || undefined,
    radioPlaylistId,
    shufflePlaylistId,
    shelves: parseSectionList(sections, { artists: self }),
  };
}

export function parsePlaylist(json: unknown, id: string): PlaylistDetail {
  const h = pageHeader(json);
  const shelf = trackShelf(json);
  const facepile = text(dig(h, "facepile", "avatarStackViewModel", "text"));
  const strap = artistsFrom(runs(h?.straplineTextOne))[0]?.name;
  const sub = runs(h?.subtitle);
  const counts = [text(h?.secondSubtitle), text(h?.subtitle)]
    .map(countFrom)
    .find((x) => x !== undefined);
  return {
    id: stripVL(id),
    title: text(h?.title),
    author: facepile || strap || artistsFrom(sub)[0]?.name || undefined,
    trackCount: counts,
    thumbnails: thumbnails(h?.thumbnail),
    description: descriptionOf(h),
    tracks: tracksOf(shelf?.contents),
    continuation: continuationOf(shelf),
  };
}

export function parsePlaylistContinuation(json: unknown): {
  tracks: Track[];
  continuation?: string;
} {
  const actions = arr(dig(json, "onResponseReceivedActions"));
  const appended = actions.flatMap((a) =>
    arr(dig(a, "appendContinuationItemsAction", "continuationItems")),
  );
  if (appended.length)
    return {
      tracks: tracksOf(appended),
      continuation: tokenOfItem(appended[appended.length - 1]),
    };
  const legacy =
    dig(json, "continuationContents", "musicPlaylistShelfContinuation") ??
    dig(json, "continuationContents", "musicShelfContinuation");
  return {
    tracks: tracksOf(legacy?.contents),
    continuation: continuationOf(legacy),
  };
}

/** Any browse page as shelves: "see all" pages, discographies, related tabs, playlists. */
export function parseBrowse(json: unknown): Shelf[] {
  const shelves = [
    ...parseSectionList(dig(tab0(json), "contents")),
    ...parseSectionList(
      dig(twoCol(json), "secondaryContents", "sectionListRenderer", "contents"),
    ),
  ];
  // The related tab answers with a bare sectionListRenderer.
  if (!shelves.length)
    shelves.push(
      ...parseSectionList(
        dig(json, "contents", "sectionListRenderer", "contents"),
      ),
    );
  const h = pageHeader(json);
  if (h && shelves[0] && !shelves[0].title) shelves[0].title = text(h.title);
  return shelves;
}

/** A song's Related tab (MPTR browse): "You might also like", playlists, similar artists, "More from". */
export function parseRelated(json: unknown): Shelf[] {
  const out: Shelf[] = [];
  for (const c of arr(
    dig(json, "contents", "sectionListRenderer", "contents"),
  )) {
    // "More from {artist}" links its title to the artist; its albums omit the artist line.
    const h = unwrap(dig(c, "musicCarouselShelfRenderer", "header"))?.node;
    const run = runs(h?.title)[0];
    const b = browseOf(run?.navigationEndpoint);
    const d =
      b.pageType === "MUSIC_PAGE_TYPE_ARTIST" && b.browseId && run
        ? { artists: [{ id: b.browseId, name: run.text }] }
        : undefined;
    const s = parseShelf(c, d);
    if (s?.items.length) out.push(s);
  }
  return out.length ? out : parseBrowse(json);
}

/** Artists from the first all-artist shelf ("Similar artists", "Fans might also like"). */
export function similarArtists(shelves: Shelf[]): ArtistSummary[] {
  const s = shelves.find(
    (x) => x.items.length && x.items.every((i) => i.type === "artist"),
  );
  return (s?.items ?? []).flatMap((i) =>
    i.type === "artist"
      ? [
          {
            id: i.id,
            name: i.name,
            subtitle: i.subtitle,
            thumbnails: i.thumbnails,
          },
        ]
      : [],
  );
}

export function parseNext(json: unknown): UpNext {
  const tabs = arr(
    dig(
      json,
      "contents",
      "singleColumnMusicWatchNextResultsRenderer",
      "tabbedRenderer",
      "watchNextTabbedResultsRenderer",
      "tabs",
    ),
  );
  const panel =
    dig(
      tabs,
      0,
      "tabRenderer",
      "content",
      "musicQueueRenderer",
      "content",
      "playlistPanelRenderer",
    ) ?? dig(json, "continuationContents", "playlistPanelContinuation");
  const tracks: Track[] = [];
  for (const c of arr(panel?.contents)) {
    const r =
      dig(c, "playlistPanelVideoRenderer") ??
      dig(
        c,
        "playlistPanelVideoWrapperRenderer",
        "primaryRenderer",
        "playlistPanelVideoRenderer",
      );
    const t = r && fromPanelVideo(r);
    if (t) tracks.push(t);
  }
  let lyricsBrowseId: string | undefined;
  let relatedBrowseId: string | undefined;
  for (const t of tabs) {
    const b = browseOf(dig(t, "tabRenderer", "endpoint"));
    if (!b.browseId) continue;
    if (
      b.pageType === "MUSIC_PAGE_TYPE_TRACK_LYRICS" ||
      b.browseId.startsWith("MPLY")
    )
      lyricsBrowseId = b.browseId;
    if (
      b.pageType === "MUSIC_PAGE_TYPE_TRACK_RELATED" ||
      b.browseId.startsWith("MPTR")
    )
      relatedBrowseId = b.browseId;
  }
  return {
    tracks,
    playlistId: panel?.playlistId,
    continuation: continuationOf(panel),
    lyricsBrowseId,
    relatedBrowseId,
  };
}

/** Plain lyrics text from an MPLY browse page, or undefined when YouTube has none. */
export function parseLyricsBrowse(json: unknown): string | undefined {
  for (const c of arr(
    dig(json, "contents", "sectionListRenderer", "contents"),
  )) {
    const t = text(dig(c, "musicDescriptionShelfRenderer", "description"));
    if (t.trim()) return t;
  }
  return undefined;
}

export function parseLibraryPlaylists(json: unknown): PlaylistSummary[] {
  return parseBrowse(json)
    .flatMap((s) => s.items)
    .filter((i) => i.type === "playlist")
    .map(({ type: _type, ...p }) => p as PlaylistSummary);
}
