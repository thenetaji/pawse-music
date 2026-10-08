import album from "../__fixtures__/album.json";
import olakAlbum from "../__fixtures__/album-olak-playlist.json";
import artist from "../__fixtures__/artist.json";
import homeCont from "../__fixtures__/home-continuation.json";
import home from "../__fixtures__/home.json";
import lyricsBrowse from "../__fixtures__/lyrics-browse.json";
import nextCont from "../__fixtures__/next-continuation.json";
import nextRadio from "../__fixtures__/next-radio.json";
import playlistCont from "../__fixtures__/playlist-continuation.json";
import playlist from "../__fixtures__/playlist.json";
import searchAlbums from "../__fixtures__/search-albums.json";
import searchAll from "../__fixtures__/search-all.json";
import searchSongs from "../__fixtures__/search-songs.json";
import suggestions from "../__fixtures__/suggestions.json";
import {
  albumIdFromPlaylist,
  parseAlbum,
  parseArtist,
  parseHome,
  parseLyricsBrowse,
  parseNext,
  parsePlaylist,
  parsePlaylistContinuation,
  parseSearch,
  parseSuggestions,
} from "./parse";

// Real WEB_REMIX responses captured 2026-10-08, trimmed.
const WEEKND = { id: "UClYV6hHlupm_S_ObS1W-DYw", name: "The Weeknd" };

describe("home", () => {
  it("reads chips, carousels and the continuation", () => {
    const feed = parseHome(home);
    expect(feed.chips.length).toBeGreaterThan(5);
    expect(feed.chips[0]).toEqual({
      title: "Podcasts",
      params: expect.any(String),
    });
    expect(feed.shelves.map((s) => s.title)).toEqual([
      "Throwback",
      "Today's biggest hits",
    ]);
    expect(feed.shelves[0].items[0]).toMatchObject({
      type: "playlist",
      id: expect.stringMatching(/^RDCLAK/),
      title: "'80s Pop",
      author: undefined,
    });
    expect(feed.continuation).toMatch(/^4qmFsg/);
  });

  it("reads a continuation page", () => {
    const feed = parseHome(homeCont);
    expect(feed.shelves.length).toBe(3);
    expect(feed.shelves[1].items[0]).toMatchObject({
      type: "album",
      kind: "single",
      artists: [{ name: "Anirudh Ravichander" }, { name: "Super Subu" }],
    });
    expect(feed.continuation).toBeTruthy();
  });
});

describe("search", () => {
  it('regroups the flat 2026 "all" layout into typed shelves with a top result', () => {
    const res = parseSearch(searchAll, "all");
    expect(res.top).toMatchObject({
      type: "track",
      id: "4NRXx6U8ABQ",
      kind: "video",
      durationSec: 263,
      artists: [WEEKND],
    });
    expect(res.shelves.map((s) => s.title)).toEqual([
      "Songs",
      "Artists",
      "Videos",
      "Albums",
      "Playlists",
    ]);
    expect(res.shelves[0].items[0]).toMatchObject({
      type: "track",
      id: "J7p4bzqLvCw",
      kind: "song",
      artists: [{ name: "The Weeknd" }],
    });
    const types = res.shelves.flatMap((s) => s.items.map((i) => i.type));
    expect(types).not.toContain(undefined);
  });

  it("parses the songs filter with album, duration and continuation", () => {
    const res = parseSearch(searchSongs, "songs");
    expect(res.items?.[0]).toEqual({
      type: "track",
      id: "J7p4bzqLvCw",
      source: "youtube",
      title: "Blinding Lights",
      artists: [WEEKND],
      album: { id: "MPREb_4U7yfKKFZLv", title: "Blinding Lights" },
      durationSec: 202,
      thumbnails: expect.arrayContaining([
        expect.objectContaining({
          url: expect.stringContaining("googleusercontent"),
        }),
      ]),
      explicit: undefined,
      kind: "song",
      setVideoId: undefined,
    });
    expect(res.continuation).toBeTruthy();
  });

  it("parses the albums filter", () => {
    const res = parseSearch(searchAlbums, "albums");
    expect(res.items?.[0]).toMatchObject({
      type: "album",
      id: "MPREb_4U7yfKKFZLv",
      kind: "single",
      year: "2019",
      artists: [WEEKND],
    });
  });

  it("reads suggestions", () => {
    expect(parseSuggestions(suggestions)).toEqual(
      expect.arrayContaining(["blinding lights", "blinding lights the weeknd"]),
    );
  });
});

describe("album", () => {
  it("fills track artists, album and art from the header", () => {
    const a = parseAlbum(album, "MPREb_TH6Wut5eTMQ");
    expect(a).toMatchObject({
      title: "After Hours",
      year: "2020",
      kind: "album",
      artists: [WEEKND],
      playlistId: "OLAK5uy_l4UqNJCpAF3kNaV37LHdRc_A07MmVdiSU",
    });
    expect(a.tracks).toHaveLength(14);
    expect(a.tracks[0]).toMatchObject({
      id: "JH398xAYpZA",
      title: "Alone Again",
      artists: [WEEKND],
      album: { id: "MPREb_TH6Wut5eTMQ", title: "After Hours" },
      durationSec: 251,
      explicit: true,
      setVideoId: "C66C36BC42A78601",
    });
    expect(a.tracks[0].thumbnails.length).toBeGreaterThan(0);
    expect(a.totalDurationSec).toBeGreaterThan(3000);
    expect(a.description).toMatch(/^After Hours is the fourth studio album/);
  });

  it("finds the album id behind an OLAK playlist", () => {
    expect(albumIdFromPlaylist(olakAlbum)).toBe("MPREb_TH6Wut5eTMQ");
  });
});

describe("artist", () => {
  it("reads header, radio/shuffle ids and shelves with see-all tokens", () => {
    const a = parseArtist(artist, WEEKND.id);
    expect(a).toMatchObject({
      name: "The Weeknd",
      subscribers: "40.1M",
      subtitle: "240M monthly audience",
      radioPlaylistId: "RDEMHSpo_Uv9STIRtF73zMywLg",
      shufflePlaylistId: "RDAOHSpo_Uv9STIRtF73zMywLg",
    });
    const titles = a.shelves.map((s) => s.title);
    expect(titles).toEqual(
      expect.arrayContaining([
        "Top songs",
        "Albums",
        "Singles & EPs",
        "Videos",
        "Fans might also like",
      ]),
    );
    const top = a.shelves.find((s) => s.title === "Top songs")!;
    expect(top.items[0]).toMatchObject({
      type: "track",
      kind: "song",
      artists: [WEEKND],
    });
    expect(top.more).toMatch(/^VLOLAK/);
    expect(a.shelves.find((s) => s.title === "Albums")!.more).toMatch(
      /^MPADUClYV6hHlupm_S_ObS1W-DYw\|/,
    );
    expect(
      a.shelves.find((s) => s.title === "Fans might also like")!.items[0].type,
    ).toBe("artist");
  });
});

describe("playlist", () => {
  it("reads header, tracks and the continuation token", () => {
    const p = parsePlaylist(
      playlist,
      "VLOLAK5uy_m9NcLauVzADCRC6rfmtow_Z6a6TuIO8g8",
    );
    expect(p).toMatchObject({
      id: "OLAK5uy_m9NcLauVzADCRC6rfmtow_Z6a6TuIO8g8",
      title: "Top songs",
      author: "The Weeknd",
      trackCount: 150,
    });
    expect(p.tracks[0]).toMatchObject({
      id: "RmYCOm4ehKs",
      title: "Save Your Tears",
      durationSec: 216,
      album: { title: "After Hours" },
      setVideoId: "68C6E519FFFB6870",
    });
    expect(p.continuation).toBeTruthy();
  });

  it("reads a continuation page", () => {
    const c = parsePlaylistContinuation(playlistCont);
    expect(c.tracks[0]).toMatchObject({
      title: "Take Me Back To LA",
      album: { title: "Hurry Up Tomorrow" },
      durationSec: 254,
    });
  });
});

describe("up next", () => {
  it("reads the radio queue, its continuation and the lyrics/related ids", () => {
    const n = parseNext(nextRadio);
    expect(n.playlistId).toBe("RDAMVMJ7p4bzqLvCw");
    expect(n.lyricsBrowseId).toBe("MPLYt_4U7yfKKFZLv-1");
    expect(n.relatedBrowseId).toBe("MPTRt_4U7yfKKFZLv-1");
    expect(n.tracks[0]).toMatchObject({
      id: "J7p4bzqLvCw",
      title: "Blinding Lights",
      durationSec: 202,
      kind: "song",
      artists: [WEEKND],
    });
    expect(n.tracks[1]).toMatchObject({
      title: "Save Your Tears",
      album: { id: "MPREb_TH6Wut5eTMQ", title: "After Hours" },
    });
    expect(n.continuation).toBeTruthy();
  });

  it("reads a radio continuation", () => {
    const n = parseNext(nextCont);
    expect(n.tracks[0]).toMatchObject({
      title: "Easy",
      artists: [expect.objectContaining({ name: "Troye Sivan" })],
    });
    expect(n.continuation).toBeTruthy();
  });

  it("reads unsynced lyrics", () => {
    expect(parseLyricsBrowse(lyricsBrowse)).toMatch(
      /^Yeah\n\nI've been tryna call/,
    );
  });
});

describe("tolerance", () => {
  it("never throws on empty or foreign shapes", () => {
    for (const junk of [{}, null, { contents: [] }, { contents: { foo: 1 } }]) {
      expect(() => [
        parseHome(junk),
        parseSearch(junk),
        parseAlbum(junk, "x"),
        parseArtist(junk, "x"),
        parsePlaylist(junk, "x"),
        parseNext(junk),
      ]).not.toThrow();
    }
    expect(parseAlbum({}, "x").tracks).toEqual([]);
  });
});
