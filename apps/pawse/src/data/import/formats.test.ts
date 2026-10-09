import type { Track } from "@pawse/music-core";

import {
  decodeImportBytes,
  ImportError,
  parseImportFile,
  parseImportFiles,
} from "./formats";
import { MATCH_SCORE, scoreTrack, UNSURE_SCORE } from "./score";

const utf16le = (s: string, bom = true) => {
  const out = bom ? [0xff, 0xfe] : [];
  for (const c of s) out.push(c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8);
  return new Uint8Array(out);
};

describe("parseImportFile", () => {
  it("reads the Takeout music library CSV", () => {
    const csv =
      "Video ID,Song Title,Album Title,Artist Name 1,Artist Name 2\n" +
      "dQw4w9WgXcQ,Never Gonna Give You Up,Whenever You Need Somebody,Rick Astley,\n" +
      'abcdefghijk,"Under Pressure",Hot Space,Queen,David Bowie\n';
    const s = parseImportFile("music library songs.csv", csv);
    expect(s.kind).toBe("youtube-takeout");
    expect(s.lists[0].title).toBe("YouTube Music library");
    expect(s.lists[0].items).toEqual([
      {
        title: "Never Gonna Give You Up",
        artist: "Rick Astley",
        album: "Whenever You Need Somebody",
        videoId: "dQw4w9WgXcQ",
      },
      {
        title: "Under Pressure",
        artist: "Queen, David Bowie",
        album: "Hot Space",
        videoId: "abcdefghijk",
      },
    ]);
  });

  it("reads Takeout playlist CSVs, new and old layout", () => {
    const fresh = parseImportFile(
      "Liked music-videos.csv",
      "Video ID,Playlist Video Creation Timestamp\ndQw4w9WgXcQ,2024-01-01T00:00:00+00:00\n",
    );
    expect(fresh.lists[0]).toEqual({
      title: "Liked music",
      liked: true,
      items: [{ title: "", videoId: "dQw4w9WgXcQ" }],
    });
    const old = parseImportFile(
      "Road trip.csv",
      "Playlist Id,Channel Id,Title,Visibility\nPLx,UCx,Road trip,Public\n\nVideo Id,Time Added\nabcdefghijk,2020-01-01 00:00:00 UTC\n",
    );
    expect(old.lists[0].title).toBe("Road trip");
    expect(old.lists[0].items).toEqual([{ title: "", videoId: "abcdefghijk" }]);
  });

  it("reads a generic CSV with quoted cells, durations and URLs", () => {
    const s = parseImportFile(
      "mine.csv",
      'Title,Artist,Duration,URL\n"Hello, World",Adele,4:55,https://youtu.be/dQw4w9WgXcQ\nSkyfall,Adele,,\n',
    );
    expect(s.kind).toBe("csv");
    expect(s.lists[0].items).toEqual([
      {
        title: "Hello, World",
        artist: "Adele",
        durationSec: 295,
        videoId: "dQw4w9WgXcQ",
      },
      { title: "Skyfall", artist: "Adele" },
    ]);
  });

  it("reads iTunes/Music tab-separated text in UTF-16 LE", () => {
    const txt =
      "Name\tArtist\tAlbum\tTime\r\nBohemian Rhapsody\tQueen\tA Night at the Opera\t354\r\n";
    for (const bytes of [utf16le(txt), utf16le(txt, false)]) {
      const s = parseImportFile("Library.txt", decodeImportBytes(bytes));
      expect(s.kind).toBe("apple-music-txt");
      expect(s.lists[0].items).toEqual([
        {
          title: "Bohemian Rhapsody",
          artist: "Queen",
          album: "A Night at the Opera",
          durationSec: 354,
        },
      ]);
    }
  });

  it("reads the Apple privacy export, playlists with their tracks file", () => {
    const tracks = JSON.stringify([
      {
        "Track Identifier": 11,
        Title: "Yellow",
        Artist: "Coldplay",
        Album: "Parachutes",
        "Track Duration": 266000,
      },
      { "Track Identifier": 12, Title: "Clocks", Artist: "Coldplay" },
    ]);
    const lib = parseImportFile("Apple Music Library Tracks.json", tracks);
    expect(lib.kind).toBe("apple-privacy");
    expect(lib.lists[0].items[0]).toEqual({
      title: "Yellow",
      artist: "Coldplay",
      album: "Parachutes",
      durationSec: 266,
    });
    const playlists = JSON.stringify([
      { Title: "Chill", "Playlist Item Identifiers": [12, 99] },
    ]);
    const both = parseImportFiles([
      { name: "Apple Music Library Playlists.json", text: playlists },
      { name: "Apple Music Library Tracks.json", text: tracks },
    ]);
    expect(both.lists[0]).toEqual({
      title: "Chill",
      items: [{ title: "Clocks", artist: "Coldplay" }],
    });
    expect(() =>
      parseImportFile("Apple Music Library Playlists.json", playlists),
    ).toThrow(ImportError);
  });

  it("rejects files without songs", () => {
    expect(() => parseImportFile("x.csv", "foo,bar\n1,2\n")).toThrow(
      ImportError,
    );
  });
});

describe("scoreTrack", () => {
  const track = (
    title: string,
    artist: string,
    durationSec?: number,
  ): Track => ({
    id: "x",
    source: "youtube",
    title,
    artists: [{ name: artist }],
    durationSec,
    thumbnails: [],
  });
  const item = { title: "Yellow", artist: "Coldplay", durationSec: 266 };

  it("matches the same song", () => {
    expect(
      scoreTrack(item, track("Yellow", "Coldplay", 267)),
    ).toBeGreaterThanOrEqual(MATCH_SCORE);
  });
  it("is unsure on a title-only import", () => {
    const s = scoreTrack({ title: "Yellow" }, track("Yellow", "Coldplay"));
    expect(s).toBeLessThan(MATCH_SCORE);
    expect(s).toBeGreaterThanOrEqual(UNSURE_SCORE);
  });
  it("drops a live version below a match", () => {
    expect(
      scoreTrack(item, track("Yellow (Live)", "Coldplay", 300)),
    ).toBeLessThan(MATCH_SCORE);
  });
  it("never rescues a wrong title with the artist", () => {
    expect(scoreTrack(item, track("Fix You", "Coldplay", 266))).toBeLessThan(
      UNSURE_SCORE,
    );
  });
});
