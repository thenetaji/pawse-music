import betterLyrics from "../__fixtures__/betterlyrics.json";
import lrclib from "../__fixtures__/lrclib-get.json";
import { sha1Hex } from "../util/sha1";
import { sapisidAuthorization } from "../youtube/auth";
import { cleanKugouLrc, kugouLyrics } from "./kugou";
import { parseLrc } from "./lrc";
import { cleanTitle, sameSong } from "./match";
import { LyricsService } from "./service";
import { parseTtml } from "./ttml";

describe("LRC", () => {
  it("parses real LRCLIB lines with end times from the next line", () => {
    const lines = parseLrc(lrclib.syncedLyrics, 200);
    expect(lines[0]).toEqual({ startMs: 13_130, endMs: 16_560, text: "Yeah" });
    expect(lines[2]).toMatchObject({
      startMs: 27_160,
      text: "I've been tryna call",
    });
  });

  it("handles repeated tags, offset and enhanced word timing", () => {
    const lines = parseLrc(
      "[offset:+100]\n[00:01.00][00:05.00]Hey\n[00:02.50]<00:02.50>Hello <00:03.00>world<00:04.00>\n[00:06.0]",
    );
    expect(lines.map((l) => [l.startMs, l.text])).toEqual([
      [900, "Hey"],
      [2400, "Hello world"],
      [4900, "Hey"],
    ]);
    expect(lines[1].words).toEqual([
      { startMs: 2400, endMs: 2900, text: "Hello " },
      { startMs: 2900, endMs: 3900, text: "world" },
    ]);
    expect(lines[2].endMs).toBe(5900);
  });

  it("strips KuGou credit lines", () => {
    const lrc =
      "[00:00.00]Song - Artist\n[00:01.00]作词：someone\n[00:02.00]作曲：someone\n[00:10.00]First line\n[00:12.00]Second line";
    expect(cleanKugouLrc(lrc)).toBe(
      "[00:10.00]First line\n[00:12.00]Second line",
    );
  });
});

describe("TTML", () => {
  it("parses real BetterLyrics word timings and drops background vocals", () => {
    const lines = parseTtml(betterLyrics.ttml);
    expect(lines[0]).toMatchObject({
      startMs: 27_395,
      endMs: 28_960,
      text: "I been tryna call",
    });
    expect(lines[0].words?.map((w) => w.text)).toEqual([
      "I ",
      "been ",
      "tryna ",
      "call",
    ]);
    expect(lines[0].words?.[3]).toEqual({
      startMs: 28_077,
      endMs: 28_960,
      text: "call",
    });
    for (const l of lines)
      expect(l.words?.every((w) => w.startMs >= l.startMs - 1)).toBe(true);
  });
});

describe("LyricsService", () => {
  it("prefers word-synced BetterLyrics over line-synced LRCLIB", async () => {
    const fetch = jest.fn(async (url: string) => {
      const body = url.includes("lrclib")
        ? lrclib
        : url.includes("boidu")
          ? betterLyrics
          : {};
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      } as Response;
    });
    const l = await new LyricsService({ fetch }).lyrics({
      id: "J7p4bzqLvCw",
      title: "Blinding Lights",
      artists: [{ name: "The Weeknd" }],
      durationSec: 200,
    });
    expect(l?.source).toBe("betterlyrics");
    expect(l?.lines[0].words?.length).toBeGreaterThan(0);
  });
});

type Route = [string, unknown, number?];
const mockFetch = (routes: Route[]) =>
  jest.fn(async (url: string) => {
    const [, body, status = 200] = routes.find(([k]) => url.includes(k)) ?? [
      "",
      {},
      404,
    ];
    return {
      ok: status < 400,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  });
const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));

describe("matching", () => {
  it("cleans video and upload noise out of titles", () => {
    expect(cleanTitle('Kesariya (From "Brahmastra")', ["Arijit Singh"])).toBe(
      "Kesariya",
    );
    expect(cleanTitle("Coldplay - Yellow (Official Video)", ["Coldplay"])).toBe(
      "Yellow",
    );
    expect(cleanTitle("Tum Hi Ho | Aashiqui 2 | Lyrical")).toBe("Tum Hi Ho");
    expect(
      cleanTitle("Diljit Dosanjh: LOVER (Official Music Video)", [
        "Diljit Dosanjh",
      ]),
    ).toBe("LOVER");
    expect(cleanTitle("Blinding Lights [4K]")).toBe("Blinding Lights");
    expect(cleanTitle("Perfect ft. Beyoncé")).toBe("Perfect");
    expect(cleanTitle("Perfect (feat. Beyoncé) (Lyric Video)")).toBe("Perfect");
    expect(cleanTitle("Yesterday - Remastered 2009")).toBe("Yesterday");
    expect(cleanTitle("Teri Ore (Full Video Song) HD")).toBe("Teri Ore");
    expect(cleanTitle("Yellow (Acoustic)")).toBe("Yellow (Acoustic)");
    expect(cleanTitle("Ishq Bulaava - Hasee Toh Phasee", ["Sanam Puri"])).toBe(
      "Ishq Bulaava - Hasee Toh Phasee",
    );
  });

  it("tells the same song from a different one", () => {
    const track = {
      title: "Teri Ore",
      artists: ["Rahat Fateh Ali Khan, Shreya Ghoshal"],
    };
    expect(
      sameSong(
        {
          title: 'Teri Ore (From "Singh Is Kinng")',
          artist: "Shreya Ghoshal、Rahat Fateh Ali Khan",
        },
        track,
      ),
    ).toBe(true);
    expect(
      sameSong(
        { title: "Kaise Mujhe", artist: "Shreya Ghoshal、Benny Dayal" },
        track,
      ),
    ).toBe(false);
    expect(sameSong({ title: "Teri Ore", artist: "Someone Else" }, track)).toBe(
      false,
    );
    expect(
      sameSong({ title: "Yellow Submarine" }, { title: "Yellow", artists: [] }),
    ).toBe(false);
    expect(
      sameSong(
        { title: "Pyaar Ke Pal", artist: "K.K." },
        { title: "Pyaar Ke Pal", artists: ["KK"] },
      ),
    ).toBe(true);
  });
});

describe("KuGou", () => {
  it("strips head lines that only name the song and its artists", () => {
    const lrc = [
      '[00:00.00]Tera Hone Laga Hoon (From "Ajab Prem Ki Ghazab Kahani") - Atif Aslam (阿特夫)/Alisha Chinai',
      "[00:00.50]Tum Hi Ho - Arijit Singh",
      "[00:01.05]Shining in the shade",
      "[00:03.72]Tera hone laga hoon",
    ].join("\n");
    expect(
      cleanKugouLrc(lrc, "Tera Hone Laga Hoon", ["Pritam", "Atif Aslam"]),
    ).toBe(
      "[00:00.50]Tum Hi Ho - Arijit Singh\n[00:01.05]Shining in the shade\n[00:03.72]Tera hone laga hoon",
    );
    expect(
      cleanKugouLrc(
        "[00:00.00]Tum Hi Ho - Arijit Singh\n[00:00.40]Tum Hi Ho\n[00:10.38]Hum tere bin",
        "Tum Hi Ho",
        ["Arijit Singh"],
      ),
    ).toBe("[00:10.38]Hum tere bin");
  });

  it("rejects hash and keyword candidates for a different song", async () => {
    const fetch = mockFetch([
      [
        "search/song",
        {
          data: {
            info: [
              {
                songname: "Kaise Mujhe",
                singername: "Shreya Ghoshal、Benny Dayal",
                duration: 343,
                hash: "h1",
              },
            ],
          },
        },
      ],
      [
        "lyrics.kugou.com/search",
        {
          candidates: [
            {
              id: "1",
              accesskey: "k",
              song: "Kaise Mujhe",
              singer: "Shreya Ghoshal、Benny Dayal",
              duration: 346644,
            },
          ],
        },
      ],
      [
        "download",
        { content: b64("[00:00.00]Kaise Mujhe\n[00:10.00]Wrong song") },
      ],
    ]);
    const track = {
      title: "Teri Ore",
      artists: ["Rahat Fateh Ali Khan, Shreya Ghoshal"],
      durationSec: 340,
    };
    expect(await kugouLyrics(fetch, track, 1000)).toBeUndefined();
    expect(fetch.mock.calls.some(([u]) => u.includes("hash=h1"))).toBe(false);
    expect(fetch.mock.calls.some(([u]) => u.includes("download"))).toBe(false);
  });
});

describe("LyricsService validation", () => {
  const yellow = {
    trackName: "Yellow",
    artistName: "Coldplay",
    duration: 267,
    instrumental: false,
    plainLyrics: "Look at the stars\nLook how they shine for you",
    syncedLyrics:
      "[00:33.60] Look at the stars\n[00:38.00] Look how they shine for you",
  };

  it("rejects an LRCLIB search hit for a different song", async () => {
    const fetch = mockFetch([
      [
        "lrclib.net/api/search",
        [{ ...yellow, trackName: "Kaise Mujhe", artistName: "Shreya Ghoshal" }],
      ],
    ]);
    const l = await new LyricsService({ fetch }).lrclib({
      id: "x",
      title: "Teri Ore",
      artists: [{ name: "Shreya Ghoshal" }],
      durationSec: 267,
    });
    expect(l).toBeNull();
  });

  it("returns plain text when the only match is a different-length recording", async () => {
    const fetch = mockFetch([
      ["lrclib.net/api/search", [yellow]],
      ["boidu", { error: "API key required" }, 401],
      ["search/song", { data: { info: [] } }],
      ["lyrics.kugou.com/search", { candidates: [] }],
    ]);
    const l = await new LyricsService({ fetch }).lyrics({
      id: "9qnqYL0eNNI",
      title: "Coldplay - Yellow (Official Video)",
      artists: [{ name: "Coldplay" }],
      durationSec: 290,
    });
    expect(l).toMatchObject({ source: "lrclib", synced: false });
    expect(l?.lines.map((x) => x.text)).toEqual([
      "Look at the stars",
      "Look how they shine for you",
    ]);
    const search = fetch.mock.calls.find(([u]) => u.includes("/search?"))?.[0];
    expect(search).toContain("track_name=Yellow&");
  });

  it("keeps synced lyrics when the recording length matches", async () => {
    const fetch = mockFetch([["lrclib.net/api/search", [yellow]]]);
    const l = await new LyricsService({ fetch }).lrclib({
      id: "x",
      title: "Yellow",
      artists: [{ name: "Coldplay" }],
      durationSec: 268,
    });
    expect(l).toMatchObject({ source: "lrclib", synced: true });
    expect(l?.lines[0]).toMatchObject({
      startMs: 33_600,
      text: "Look at the stars",
    });
  });
});

describe("SAPISIDHASH", () => {
  it("hashes like the web app, with 1P/3P variants", () => {
    expect(sha1Hex("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    const h = sapisidAuthorization(
      "SAPISID=a; __Secure-1PAPISID=b; __Secure-3PAPISID=c",
      "https://music.youtube.com",
      1700000000,
    );
    expect(h).toBe(
      [
        `SAPISIDHASH 1700000000_${sha1Hex("1700000000 a https://music.youtube.com")}`,
        `SAPISID1PHASH 1700000000_${sha1Hex("1700000000 b https://music.youtube.com")}`,
        `SAPISID3PHASH 1700000000_${sha1Hex("1700000000 c https://music.youtube.com")}`,
      ].join(" "),
    );
    expect(
      sapisidAuthorization("SID=x", "https://music.youtube.com"),
    ).toBeUndefined();
  });
});
