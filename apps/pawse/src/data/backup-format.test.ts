import type { Track } from "@pawse/music-core";

import {
  BackupError,
  makeBackup,
  mergeBackup,
  parseBackup,
} from "./backup-format";
import {
  DEFAULT_SETTINGS,
  type LibraryData,
  mergeLikes,
  parsePlaylistId,
} from "./library-model";

const t = (id: string): Track => ({
  id,
  source: "youtube",
  title: id,
  artists: [{ name: "A" }],
  thumbnails: [],
});
const lib = (p: Partial<LibraryData> = {}): LibraryData => ({
  liked: [],
  playlists: [],
  history: [],
  settings: DEFAULT_SETTINGS,
  recentSearches: [],
  savedAlbums: [],
  followedArtists: [],
  ytPlaylists: [],
  likedRemoteIds: [],
  syncedAt: 0,
  ...p,
});

describe("backup", () => {
  it("round-trips without cookies and merges without duplicates", () => {
    const mine = lib({
      liked: [t("a")],
      settings: {
        ...DEFAULT_SETTINGS,
        cookies: "SAPISID=x",
        accountName: "me",
      },
      history: [{ track: t("a"), at: 1 }],
    });
    const file = JSON.parse(JSON.stringify(makeBackup(mine)));
    expect(file.settings.cookies).toBeUndefined();
    expect(file.settings.accountName).toBeUndefined();
    const other = parseBackup({
      ...file,
      liked: [t("a"), t("b")],
      history: [
        { track: t("a"), at: 1 },
        { track: t("b"), at: 2 },
      ],
      playlists: [
        { id: "p", title: "P", tracks: [t("b")], createdAt: 1, updatedAt: 1 },
      ],
      settings: { ...file.settings, quality: "saver", catColor: "pink" },
    });
    const { data, added } = mergeBackup(mine, other);
    expect(added).toEqual({ liked: 1, playlists: 1, plays: 1 });
    expect(data.liked?.map((x) => x.id)).toEqual(["a", "b"]);
    expect(data.history?.map((x) => x.at)).toEqual([2, 1]);
    expect(data.settings).toMatchObject({
      cookies: "SAPISID=x",
      quality: "saver",
      catColor: "orange",
    });
  });

  it("rejects foreign files and drops malformed rows", () => {
    expect(() => parseBackup({ liked: [] })).toThrow(BackupError);
    expect(() => parseBackup({ format: "flow.library", version: 99 })).toThrow(
      /newer/,
    );
    const b = parseBackup({
      format: "flow.library",
      version: 1,
      liked: [t("ok"), { id: 5 }, { ...t("bad"), source: "spotify" }, null],
      history: [{ track: t("x") }, { track: { nope: 1 }, at: 3 }],
    });
    expect(b.liked.map((x) => x.id)).toEqual(["ok"]);
    expect(b.history).toEqual([]);
  });
});

describe("library model", () => {
  it("parses playlist links and ids", () => {
    for (const [input, id] of [
      [
        "https://music.youtube.com/playlist?list=PLabc_DEF-123",
        "PLabc_DEF-123",
      ],
      ["https://www.youtube.com/watch?v=xyz&list=OLAK5uy_k1", "OLAK5uy_k1"],
      ["https://music.youtube.com/browse/VLPLabc", "PLabc"],
      ["VLRDCLAK5uy_x", "RDCLAK5uy_x"],
      ["list=PLq", "PLq"],
      ["PLq", "PLq"],
    ])
      expect(parsePlaylistId(input)).toBe(id);
    expect(parsePlaylistId("hello")).toBeUndefined();
  });

  it("merges likes: remote order, local-only kept, remote unlikes dropped", () => {
    const merged = mergeLikes(
      [t("new"), t("a"), t("gone")],
      [t("b"), t("a")],
      ["a", "gone"],
    );
    expect(merged.map((x) => x.id)).toEqual(["new", "b", "a"]);
  });
});
