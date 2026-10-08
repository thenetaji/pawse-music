import { StreamError } from "@studio/music-core";

import blindingLights from "./__fixtures__/saavn-search-blinding-lights.json";
import tumHiHo from "./__fixtures__/saavn-search-tum-hi-ho.json";
import { createResolver } from "./resolver";
import {
  JioSaavn,
  decryptMediaUrl,
  matchSong,
  normalizeTitle,
  toSaavnSong,
} from "./saavn";
import { desEcb } from "./util/des";

const hex = (b: Uint8Array) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const bytes = (h: string) =>
  Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const songs = (j: { results: unknown[] }) =>
  j.results.map(toSaavnSong).filter((s) => !!s);

describe("DES-ECB", () => {
  it("matches the FIPS 46 worked example both ways", () => {
    const c = desEcb(
      bytes("0123456789abcdef"),
      bytes("133457799bbcdff1"),
      false,
    );
    expect(hex(c)).toBe("85e813540f0ab405");
    expect(hex(desEcb(c, bytes("133457799bbcdff1"), true))).toBe(
      "0123456789abcdef",
    );
  });

  it("decrypts a real encrypted_media_url", () => {
    const url = decryptMediaUrl(
      tumHiHo.results[0].more_info.encrypted_media_url,
    );
    expect(url).toMatch(
      /^https:\/\/aac\.saavncdn\.com\/\d+\/[0-9a-f]+_96\.mp4$/,
    );
  });
});

describe("matching", () => {
  it('normalises "(From …)", feat., remaster tags, entities and diacritics', () => {
    expect(normalizeTitle("Tum Hi Ho (From &quot;Aashiqui 2&quot;)")).toBe(
      "tum hi ho",
    );
    expect(normalizeTitle("Café Del Mar - Remastered 2011")).toBe(
      "cafe del mar",
    );
    expect(normalizeTitle("Peaches (feat. Daniel Caesar)")).toBe("peaches");
    expect(normalizeTitle("Halo [2019 Remaster]")).toBe("halo");
    expect(normalizeTitle("Blinding Lights (Remix)")).toBe(
      "blinding lights remix",
    );
  });

  it("matches title, primary artist and duration and upgrades to 320 kbps", () => {
    const hit = matchSong(
      {
        title: "Tum Hi Ho",
        artists: [{ name: "Arijit Singh" }],
        durationSec: 260,
      },
      songs(tumHiHo),
    );
    expect(hit?.title).toBe("Tum Hi Ho");
    expect(hit?.mediaUrl).toMatch(/_320\.mp4$/);
  });

  it("rejects a wrong duration or a karaoke/cover artist", () => {
    expect(
      matchSong(
        {
          title: "Tum Hi Ho",
          artists: [{ name: "Arijit Singh" }],
          durationSec: 250,
        },
        songs(tumHiHo),
      ),
    ).toBeUndefined();
    expect(
      matchSong(
        {
          title: "Blinding Lights",
          artists: [{ name: "The Weeknd" }],
          durationSec: 200,
        },
        songs(blindingLights),
      ),
    ).toBeUndefined();
  });
});

describe("resolve", () => {
  const fetchOf = (body: unknown) =>
    jest.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => body }) as Response,
    );

  it("returns a saavn stream or no_audio", async () => {
    const saavn = new JioSaavn({ fetch: fetchOf(tumHiHo) });
    const s = await saavn.resolve({
      id: "v",
      source: "youtube",
      title: "Tum Hi Ho",
      artists: [{ name: "Arijit Singh" }],
      durationSec: 262,
    });
    expect(s).toMatchObject({
      via: "saavn",
      mimeType: "audio/mp4",
      bitrate: 320_000,
    });
    const miss = new JioSaavn({ fetch: fetchOf(blindingLights) });
    await expect(
      miss.resolve({
        id: "v",
        source: "youtube",
        title: "Blinding Lights",
        artists: [{ name: "The Weeknd" }],
        durationSec: 200,
      }),
    ).rejects.toMatchObject({
      code: "no_audio",
    });
  });
});

describe("createResolver", () => {
  const ok = (via: string) => ({
    resolve: jest.fn(async () => ({
      url: via,
      mimeType: "audio/mp4",
      bitrate: 1,
      expiresAt: 0,
      via,
    })),
  });
  const fail = (code: StreamError["code"]) => ({
    resolve: jest.fn(async () => Promise.reject(new StreamError(code, code))),
  });
  const song = {
    id: "v",
    source: "youtube" as const,
    title: "t",
    artists: [],
    kind: "song" as const,
  };

  it("prefers YouTube, then falls back to Saavn", async () => {
    expect(
      (
        await createResolver({ youtube: ok("yt"), saavn: ok("sv") }).resolve(
          song,
        )
      ).via,
    ).toBe("yt");
    expect(
      (
        await createResolver({
          youtube: fail("blocked"),
          saavn: ok("sv"),
        }).resolve(song)
      ).via,
    ).toBe("sv");
  });

  it("tries Saavn first for songs when preferred, and only for songs", async () => {
    const r = createResolver({
      youtube: ok("yt"),
      saavn: ok("sv"),
      preferSaavn: true,
    });
    expect((await r.resolve(song)).via).toBe("sv");
    expect((await r.resolve({ ...song, kind: "video" })).via).toBe("yt");
    expect(
      (
        await createResolver({
          youtube: ok("yt"),
          saavn: fail("no_audio"),
          preferSaavn: true,
        }).resolve(song)
      ).via,
    ).toBe("yt");
  });

  it("sends saavn tracks to Saavn and surfaces YouTube's error when both fail", async () => {
    const youtube = ok("yt");
    expect(
      (
        await createResolver({ youtube, saavn: ok("sv") }).resolve({
          ...song,
          source: "saavn",
        })
      ).via,
    ).toBe("sv");
    expect(youtube.resolve).not.toHaveBeenCalled();
    await expect(
      createResolver({
        youtube: fail("age_restricted"),
        saavn: fail("no_audio"),
      }).resolve(song),
    ).rejects.toMatchObject({ code: "age_restricted" });
  });
});
