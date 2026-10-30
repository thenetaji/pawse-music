import type { ResolvedStream } from "@pawse/music-core";

import {
  isLowTier,
  normalizeGainDb,
  qualityBadge,
  qualityNote,
  sampleRateText,
  streamFormat,
  streamSource,
} from "./stream-info";

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
    expect(qualityBadge(stream({}))).toEqual({
      label: "AAC 128 kbps",
      hq: false,
    });
    expect(qualityBadge(stream({ bitrate: 256_000 }))).toEqual({
      label: "AAC 256 kbps",
      hq: true,
    });
    expect(
      qualityBadge(
        stream({ mimeType: 'audio/webm; codecs="opus"', bitrate: 158_000 }),
      ),
    ).toEqual({ label: "Opus 160 kbps", hq: false });
  });

  it("says data saver for the small tiers instead of rounding up", () => {
    expect(
      qualityBadge(
        stream({ mimeType: 'audio/mp4; codecs="mp4a.40.5"', bitrate: 49_000 }),
      ),
    ).toEqual({ label: "AAC 48 kbps · data saver", hq: false });
    expect(
      qualityBadge(
        stream({ mimeType: 'audio/webm; codecs="opus"', bitrate: 58_000 }),
      )?.label,
    ).toBe("Opus 56 kbps · data saver");
    expect(isLowTier(stream({ bitrate: 130_000 }))).toBe(false);
    expect(
      isLowTier(
        stream({ via: "local", bitrate: 0, contentLength: 400_000 }),
        100,
      ),
    ).toBe(false);
  });

  it("names the Opus kept as a repackaged file", () => {
    const st = stream({
      via: "remux:opus",
      mimeType: 'audio/mp4; codecs="opus"',
      bitrate: 160_000,
    });
    expect(qualityBadge(st)?.label).toBe("Opus 160 kbps");
    expect(streamFormat(st.mimeType)).toEqual({
      codec: "Opus",
      container: "MP4",
    });
    expect(streamFormat('audio/x-caf; codecs="opus"').container).toBe("CAF");
    expect(streamSource(st.via)).toBe("YouTube (Opus, repackaged for iPhone)");
  });

  it("shows JioSaavn as plain kilobits", () => {
    expect(qualityBadge(stream({ via: "saavn", bitrate: 320_000 }))).toEqual({
      label: "320 kbps · JioSaavn",
      hq: true,
    });
  });

  it("falls back to size over length for downloads, and to nothing", () => {
    expect(
      qualityBadge(
        stream({ via: "local", bitrate: 0, contentLength: 4_000_000 }),
        100,
      )?.label,
    ).toBe("AAC 320 kbps");
    expect(qualityBadge(stream({ bitrate: 0 }))).toBeUndefined();
  });
});

describe("qualityNote", () => {
  it("explains each tier in a sentence", () => {
    expect(qualityNote(stream({}))).toBe(
      "128 kbps AAC: YouTube's standard quality.",
    );
    expect(
      qualityNote(
        stream({ mimeType: 'audio/mp4; codecs="mp4a.40.5"', bitrate: 49_000 }),
        undefined,
        "Automatic chose it because the connection was slow.",
      ),
    ).toBe(
      "48 kbps saves data but sounds thin and noisy on detailed music. Automatic chose it because the connection was slow.",
    );
    expect(
      qualityNote(
        stream({
          via: "remux:opus",
          mimeType: 'audio/mp4; codecs="opus"',
          bitrate: 160_000,
        }),
      ),
    ).toBe("Opus 160 kbps: YouTube's best quality, repackaged for iPhone.");
    expect(qualityNote(stream({ via: "saavn", bitrate: 320_000 }))).toMatch(
      /^320 kbps from JioSaavn/,
    );
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
