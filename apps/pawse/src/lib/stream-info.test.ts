import type { ResolvedStream } from "@pawse/music-core";

import { normalizeGainDb, qualityBadge, sampleRateText } from "./stream-info";

jest.mock("@pawse/player", () => ({
  normalizeVolume: (db?: number) =>
    db && db > 0 ? Math.min(1, Math.max(0.35, 10 ** (-db / 20))) : 1,
}));

const stream = (o: Partial<ResolvedStream>): ResolvedStream => ({
  url: "u",
  mimeType: 'audio/mp4; codecs="mp4a.40.2"',
  bitrate: 130_000,
  expiresAt: 0,
  via: "youtube:ios",
  ...o,
});

describe("qualityBadge", () => {
  it("names the codec and the tier YouTube sells", () => {
    expect(qualityBadge(stream({}))).toEqual({ label: "AAC 128", hq: false });
    expect(qualityBadge(stream({ bitrate: 256_000 }))).toEqual({
      label: "AAC 256",
      hq: true,
    });
    expect(
      qualityBadge(
        stream({ mimeType: 'audio/webm; codecs="opus"', bitrate: 158_000 }),
      ),
    ).toEqual({ label: "Opus 160", hq: false });
  });

  it("shows JioSaavn as plain kilobits", () => {
    expect(qualityBadge(stream({ via: "saavn", bitrate: 320_000 }))).toEqual({
      label: "320 kbps",
      hq: true,
    });
  });

  it("falls back to size over length for downloads, and to nothing", () => {
    expect(
      qualityBadge(
        stream({ via: "local", bitrate: 0, contentLength: 4_000_000 }),
        100,
      )?.label,
    ).toBe("AAC 320");
    expect(qualityBadge(stream({ bitrate: 0 }))).toBeUndefined();
  });
});

describe("normalizeGainDb", () => {
  it("is the turn-down for loud songs and zero otherwise", () => {
    expect(normalizeGainDb(3)).toBe(-3);
    expect(normalizeGainDb(-2)).toBe(0);
    expect(normalizeGainDb(undefined)).toBe(0);
  });
});

describe("sampleRateText", () => {
  it("writes kilohertz", () => {
    expect(sampleRateText(44100)).toBe("44.1 kHz");
    expect(sampleRateText(48000)).toBe("48 kHz");
    expect(sampleRateText(undefined)).toBeUndefined();
  });
});
