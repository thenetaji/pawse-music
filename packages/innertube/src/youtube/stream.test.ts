import { StreamError } from "@pawse/music-core";

import botCheck from "../__fixtures__/player-bot-check.json";
import unplayable from "../__fixtures__/player-unplayable.json";
import player from "../__fixtures__/player-visionos.json";
import {
  DEFAULT_ANDROID_STREAM_CLIENTS,
  DEFAULT_STREAM_CLIENTS,
  DEFAULT_STREAM_CLIENTS_V2,
  parseClientsConfig,
} from "./clients";
import { YouTubeMusic } from "./music";
import { isYouTubeResting, loudnessOf, pickAudioFormat } from "./stream";

type Handler = (url: string, init: RequestInit) => unknown;
const reply = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

/** Routes player POSTs to `players` in order, media range GETs to `media`, everything else 404. */
function mockFetch(
  players: unknown[],
  media: Handler = () => reply({}, 206),
  config?: Handler,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.includes("/youtubei/v1/player"))
      return reply(players[Math.min(i++, players.length - 1)]);
    if (url.includes("googlevideo.com")) return media(url, init) as Response;
    if (
      config &&
      (url.includes("innertube-clients.json") || url.includes("latest_version"))
    )
      return config(url, init) as Response;
    return reply({}, 404);
  });
  return {
    fetch,
    calls,
    players: () => calls.filter((c) => c.url.includes("/player")),
  };
}

const track = {
  id: "dQw4w9WgXcQ",
  source: "youtube" as const,
  title: "x",
  artists: [],
};
const yt = (fetch: any, extra = {}) =>
  new YouTubeMusic({
    fetch,
    clientsConfigUrl: null,
    cookies: () => "SAPISID=abc; SID=def",
    ...extra,
  });
const clientOf = (c: { init: RequestInit }) =>
  JSON.parse(String(c.init.body)).context.client;

describe("format choice (real VISIONOS response)", () => {
  it("takes itag 140 AAC, never WebM/Opus or ciphered formats", () => {
    const f = pickAudioFormat(player.streamingData.adaptiveFormats);
    expect(f?.itag).toBe(140);
    const ciphered = player.streamingData.adaptiveFormats.map((x) =>
      x.itag === 140 ? { ...x, url: undefined, signatureCipher: "s=1" } : x,
    );
    expect(pickAudioFormat(ciphered)?.itag).toBe(139);
    expect(
      pickAudioFormat(
        player.streamingData.adaptiveFormats.filter((x) =>
          /webm/.test(x.mimeType),
        ),
      ),
    ).toBeUndefined();
  });

  it("takes itag 139 on data saver", () => {
    expect(
      pickAudioFormat(player.streamingData.adaptiveFormats, "saver")?.itag,
    ).toBe(139);
  });

  it("derives loudness relative to the target", () => {
    expect(loudnessOf(player.playerConfig.audioConfig)).toBeCloseTo(0.99, 2);
    expect(loudnessOf({ loudnessDb: -2.5 })).toBe(-2.5);
  });
});

describe("client fallback chain", () => {
  it("resolves on the first client signed out, with expiry, loudness and UA header", async () => {
    const m = mockFetch([player]);
    const s = await yt(m.fetch).resolve(track);
    expect(s).toMatchObject({
      mimeType: expect.stringContaining("mp4a"),
      bitrate: 130677,
      via: "youtube:visionos-1.02",
      loudnessDb: expect.any(Number),
    });
    expect(s.headers).toEqual({
      "User-Agent": DEFAULT_STREAM_CLIENTS[0].userAgent,
    });
    expect(s.expiresAt - Date.now()).toBeGreaterThan(21_000_000);
    const [call] = m.players();
    expect(call.url).toMatch(
      /^https:\/\/www\.youtube\.com\/youtubei\/v1\/player/,
    );
    expect(clientOf(call)).toMatchObject({
      clientName: "VISIONOS",
      clientVersion: "1.02",
      deviceModel: "RealityDevice17,1",
      osVersion: "26.5.23O471",
    });
    const headers = call.init.headers as Record<string, string>;
    expect(headers["X-YouTube-Client-Name"]).toBe("101");
    expect(Object.keys(headers).map((h) => h.toLowerCase())).not.toEqual(
      expect.arrayContaining(["cookie"]),
    );
    expect(headers.Authorization).toBeUndefined();
    expect(call.init.credentials).toBe("omit");
  });

  it("moves to the next client on a non-bot refusal and reports blocked when all fail", async () => {
    const refused = { playabilityStatus: { status: "FOO", reason: "nope" } };
    const ok = mockFetch([refused, player]);
    const s = await yt(ok.fetch).resolve(track);
    expect(s.via).toBe("youtube:visionos-1.03");

    const bad = mockFetch([refused]);
    await expect(yt(bad.fetch).resolve(track)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(bad.players().map((c) => clientOf(c).clientVersion)).toEqual([
      "1.02",
      "1.03",
      "1.01",
      "1.04",
      "1.02",
    ]);
  });

  it("stops early on a definite unplayable", async () => {
    const m = mockFetch([unplayable, player]);
    const err = await yt(m.fetch)
      .resolve(track)
      .catch((e) => e);
    expect(err).toBeInstanceOf(StreamError);
    expect(err.code).toBe("unplayable");
    expect(m.players()).toHaveLength(1);
  });

  it("maps age gates and missing AAC", async () => {
    const age = {
      playabilityStatus: {
        status: "LOGIN_REQUIRED",
        reason: "Sign in to confirm your age",
      },
    };
    await expect(
      yt(mockFetch([age]).fetch).resolve(track),
    ).rejects.toMatchObject({ code: "age_restricted" });
    const webmOnly = {
      ...player,
      streamingData: {
        ...player.streamingData,
        adaptiveFormats: player.streamingData.adaptiveFormats.filter((f) =>
          /webm/.test(f.mimeType),
        ),
      },
    };
    await expect(
      yt(mockFetch([webmOnly]).fetch).resolve(track),
    ).rejects.toMatchObject({ code: "no_audio" });
  });

  it("skips a client whose media URL answers 403", async () => {
    let n = 0;
    const m = mockFetch([player], (_url, init) => {
      expect((init.headers as Record<string, string>).Range).toBe(
        "bytes=3449445-3449446",
      );
      return reply({}, n++ === 0 ? 403 : 206);
    });
    expect((await yt(m.fetch).resolve(track)).via).toBe(
      "youtube:visionos-1.03",
    );
  });

  it("asks again without the saved visitor id when every media URL answers 403", async () => {
    // Media URLs only work once the player was asked without a visitor id.
    const m = mockFetch([player], () =>
      reply({}, clientOf(m.players().at(-1)!).visitorData ? 403 : 206),
    );
    const s = await yt(m.fetch, { visitorData: "Cgt2aXNpdG9y" }).resolve(track);
    expect(s.via).toBe("youtube:visionos-1.02");
    expect(m.players().map((c) => clientOf(c).visitorData)).toEqual([
      ...Array(DEFAULT_STREAM_CLIENTS.length).fill("Cgt2aXNpdG9y"),
      undefined,
    ]);
  });

  it("falls back to the native VISIONOS profile with a cpn", async () => {
    const native = DEFAULT_STREAM_CLIENTS.findIndex((c) => c.cpn);
    let n = 0;
    const m = mockFetch([player], () => reply({}, n++ < native ? 403 : 206));
    const s = await yt(m.fetch).resolve(track);
    expect(s.via).toBe("youtube:visionos_app-1.04");
    const call = m.players().at(-1)!;
    expect(call.url).toMatch(
      /^https:\/\/youtubei\.googleapis\.com\/youtubei\/v1\/player\?prettyPrint=false&t=[\w-]{12}&id=dQw4w9WgXcQ$/,
    );
    const cpn = JSON.parse(String(call.init.body)).cpn;
    expect(cpn).toMatch(/^[\w-]{16}$/);
    expect(s.url.endsWith(`&cpn=${cpn}`)).toBe(true);
    expect(
      (call.init.headers as Record<string, string>)[
        "X-Goog-Api-Format-Version"
      ],
    ).toBe("2");
  });

  it("returns unverified when the range check exceeds its budget", async () => {
    const m = mockFetch([player], () => new Promise(() => undefined));
    const t0 = Date.now();
    const s = await yt(m.fetch, { verifyBudgetMs: 50 }).resolve(track);
    expect(s.via).toBe("youtube:visionos-1.02");
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it("uses the remote client list and falls back to the built-in one on error", async () => {
    const remote = {
      clients: [
        {
          ...DEFAULT_STREAM_CLIENTS[0],
          name: "remote-x",
          clientVersion: "9.9",
        },
      ],
    };
    const m = mockFetch([player], undefined, () => reply(remote));
    const s = await yt(m.fetch, {
      clientsConfigUrl: "https://example.test/innertube-clients.json",
    }).resolve(track);
    expect(s.via).toBe("youtube:remote-x");

    const broken = mockFetch(
      [{ playabilityStatus: { status: "FOO", reason: "nope" } }],
      undefined,
      () => reply({ clients: "nope" }),
    );
    await yt(broken.fetch, {
      clientsConfigUrl: "https://example.test/innertube-clients.json",
    })
      .resolve(track)
      .catch(() => undefined);
    expect(broken.players().map((c) => clientOf(c).clientVersion)).toEqual([
      "1.02",
      "1.03",
      "1.01",
      "1.04",
      "1.02",
    ]);
  });

  it("ships a remote config file that matches the built-in lists", () => {
    const remote = require("../../../../sources/innertube-clients.json");
    expect(parseClientsConfig(remote)).toEqual(DEFAULT_STREAM_CLIENTS);
    expect(parseClientsConfig(remote, "android")).toEqual(
      DEFAULT_ANDROID_STREAM_CLIENTS,
    );
  });
});

describe("Android and failed clients", () => {
  const webmOnly = {
    ...player,
    streamingData: {
      ...player.streamingData,
      adaptiveFormats: player.streamingData.adaptiveFormats.filter((f) =>
        /webm/.test(f.mimeType),
      ),
    },
  };

  it("starts Android on VISIONOS (no ANDROID_VR), reads the remote android list, and keeps iOS on VISIONOS", async () => {
    const m = mockFetch([{ playabilityStatus: { status: "FOO" } }]);
    await yt(m.fetch, { platform: "android" })
      .resolve(track)
      .catch(() => undefined);
    expect(m.players().map((c) => clientOf(c).clientName)).toEqual(
      Array(DEFAULT_STREAM_CLIENTS.length).fill("VISIONOS"),
    );

    const remote = {
      clients: [{ ...DEFAULT_STREAM_CLIENTS[0], name: "ios-x" }],
      android: [{ ...DEFAULT_STREAM_CLIENTS[0], name: "android-x" }],
    };
    const url = "https://example.test/innertube-clients.json";
    const r = mockFetch([player], undefined, () => reply(remote));
    expect(
      (
        await yt(r.fetch, {
          platform: "android",
          clientsConfigUrl: url,
        }).resolve(track)
      ).via,
    ).toBe("youtube:android-x");
    expect(
      (
        await yt(r.fetch, { platform: "ios", clientsConfigUrl: url }).resolve(
          track,
        )
      ).via,
    ).toBe("youtube:ios-x");

    // An older remote file without `android` leaves Android on its built-in order.
    const old = mockFetch([player], undefined, () =>
      reply({ clients: remote.clients }),
    );
    expect(
      (
        await yt(old.fetch, {
          platform: "android",
          clientsConfigUrl: url,
        }).resolve(track)
      ).via,
    ).toBe("youtube:visionos-1.02");
  });

  it("accepts Opus only on Android and only when no AAC is offered", async () => {
    const s = await yt(mockFetch([webmOnly]).fetch, {
      platform: "android",
    }).resolve(track);
    expect(s.mimeType).toMatch(/^audio\/webm/);
    expect(s.bitrate).toBe(136544);
    expect(
      (
        await yt(mockFetch([player]).fetch, { platform: "android" }).resolve(
          track,
        )
      ).mimeType,
    ).toMatch(/mp4a/);
    await expect(
      yt(mockFetch([webmOnly]).fetch, { platform: "ios" }).resolve(track),
    ).rejects.toMatchObject({ code: "no_audio" });
  });

  it("never returns an excluded client and tries avoided ones last", async () => {
    const m = mockFetch([player]);
    const s = await yt(m.fetch).resolve(track, {
      exclude: ["youtube:visionos-1.02"],
      avoid: ["youtube:visionos-1.03"],
    });
    expect(s.via).toBe("youtube:visionos-1.01");

    const all = DEFAULT_STREAM_CLIENTS.map((c) => `youtube:${c.name}`);
    const none = mockFetch([player]);
    await expect(
      yt(none.fetch).resolve(track, { exclude: all }),
    ).rejects.toMatchObject({ code: "blocked" });
    expect(none.players()).toHaveLength(0);
  });
});

describe("bot checks rest YouTube", () => {
  const MIN = 60_000;
  let now = Date.UTC(2026, 9, 12);
  beforeEach(() => {
    now = Date.UTC(2026, 9, 12);
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it("stops the chain on the first bot check and skips the retry without a visitor id", async () => {
    const m = mockFetch([botCheck, player]);
    const err = await yt(m.fetch, { visitorData: "Cgt2aXNpdG9y" })
      .resolve(track)
      .catch((e) => e);
    expect(err).toMatchObject({ code: "blocked" });
    expect(err.message).toMatch(/not a bot/);
    expect(m.players()).toHaveLength(1);
  });

  it("rests 15, then 30, then 60 min without a network call, and a working resolve resets it", async () => {
    let answer: unknown = botCheck;
    const m = mockFetch([]);
    m.fetch.mockImplementation(async (url: string, init: RequestInit = {}) => {
      m.calls.push({ url, init });
      if (url.includes("/youtubei/v1/player")) return reply(answer);
      return reply({}, 206);
    });
    const onRequestError = jest.fn();
    const y = yt(m.fetch, { onRequestError });
    const tryNow = () => y.resolve(track).catch((e) => e);

    expect(isYouTubeResting(await tryNow())).toBe(false);
    expect(onRequestError).toHaveBeenCalledWith(
      "player",
      expect.objectContaining({ message: expect.stringMatching(/15 min/) }),
    );
    now += 14 * MIN;
    const resting = await tryNow();
    expect(isYouTubeResting(resting)).toBe(true);
    expect(resting).toMatchObject({ code: "blocked" });
    expect(m.players()).toHaveLength(1);

    now += 2 * MIN;
    await tryNow();
    expect(m.players()).toHaveLength(2);
    now += 29 * MIN;
    expect(isYouTubeResting(await tryNow())).toBe(true);
    now += 2 * MIN;
    await tryNow();
    now += 59 * MIN;
    expect(isYouTubeResting(await tryNow())).toBe(true);
    now += 2 * MIN;
    answer = player;
    expect((await y.resolve(track)).via).toBe("youtube:visionos-1.02");

    answer = botCheck;
    await tryNow();
    now += 16 * MIN;
    expect(isYouTubeResting(await tryNow())).toBe(false);
    expect(m.players()).toHaveLength(6);
  });

  it("treats an answer for a different video as a bot answer", async () => {
    const decoy = {
      ...player,
      videoDetails: { ...player.videoDetails, videoId: "aaaaaaaaaaa" },
    };
    const m = mockFetch([decoy, player]);
    const y = yt(m.fetch);
    await expect(y.resolve(track)).rejects.toMatchObject({
      code: "blocked",
      message: "YouTube answered for a different video",
    });
    expect(m.players()).toHaveLength(1);
    expect(isYouTubeResting(await y.resolve(track).catch((e) => e))).toBe(true);
  });

  it("keeps one saved visitor id and swaps it only after a bot block, at most hourly", async () => {
    let answer: unknown = botCheck;
    const players: string[] = [];
    const fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes("/youtubei/v1/player")) {
        players.push(clientOf({ init }).visitorData);
        return reply(answer);
      }
      if (url.includes("/youtubei/v1/search"))
        return reply({ responseContext: { visitorData: "Fresh" } });
      return reply({}, 404);
    });
    const onVisitorData = jest.fn();
    const y = yt(fetch, { visitorData: "Saved", onVisitorData });
    await y.search("x").catch(() => undefined);
    expect(onVisitorData).not.toHaveBeenCalled();
    await y.resolve(track).catch(() => undefined);
    expect(players).toEqual(["Saved"]);

    await y.search("x").catch(() => undefined);
    expect(onVisitorData).toHaveBeenCalledWith("Fresh");
    now += 16 * MIN;
    await y.resolve(track).catch(() => undefined);
    expect(players).toEqual(["Saved", "Fresh"]);
    // A second block within the hour keeps the id.
    now += 31 * MIN;
    answer = player;
    await y.resolve(track);
    expect(players.at(-1)).toBe("Fresh");
    expect(onVisitorData).toHaveBeenCalledTimes(1);
  });
});

describe("client list v2", () => {
  it("ships a v2 config file that matches the built-in v2 list", () => {
    const remote = require("../../../../sources/innertube-clients-v2.json");
    expect(remote.provenance.ejs.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(parseClientsConfig(remote)).toEqual(DEFAULT_STREAM_CLIENTS_V2);
    expect(parseClientsConfig(remote, "android")).toEqual(
      DEFAULT_STREAM_CLIENTS_V2,
    );
  });
});
