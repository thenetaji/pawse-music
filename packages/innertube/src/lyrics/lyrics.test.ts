import betterLyrics from "../__fixtures__/betterlyrics.json";
import lrclib from "../__fixtures__/lrclib-get.json";
import { sapisidAuthorization } from "../youtube/auth";
import { sha1Hex } from "../util/sha1";
import { cleanKugouLrc } from "./kugou";
import { parseLrc } from "./lrc";
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
