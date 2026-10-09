import {
  DEFAULT_SETTINGS,
  migrateLocale,
  migrateQuality,
  type Settings,
} from "./library-model";

const merged = (saved: Record<string, unknown>) =>
  ({ ...DEFAULT_SETTINGS, ...saved }) as Settings;

describe("migrateQuality", () => {
  it("moves older per-network choices to Automatic", () => {
    const saved = {
      quality: "high",
      qualityCellular: "saver",
      dataSaver: false,
    };
    const s = migrateQuality(merged(saved), saved as Partial<Settings>);
    expect(s.quality).toBe("auto");
    expect(s.qualityCellular).toBe("auto");
    expect(s.qualityV2).toBe(true);
    expect("dataSaver" in s).toBe(false);
  });

  it("keeps an explicit Low and the old data saver switch", () => {
    const saved = {
      quality: "saver",
      qualityCellular: "high",
      dataSaver: true,
    };
    const s = migrateQuality(merged(saved), saved as Partial<Settings>);
    expect(s.quality).toBe("saver");
    expect(s.qualityCellular).toBe("saver");
  });

  it("maps the removed Normal download quality to High", () => {
    const saved = { downloadQuality: "normal" };
    expect(
      migrateQuality(merged(saved), saved as Partial<Settings>).downloadQuality,
    ).toBe("high");
  });

  it("leaves fresh installs and migrated settings alone", () => {
    expect(migrateQuality(DEFAULT_SETTINGS, undefined)).toBe(DEFAULT_SETTINGS);
    const saved = { quality: "high", qualityV2: true } as Partial<Settings>;
    const s = merged(saved);
    expect(migrateQuality(s, saved)).toBe(s);
  });
});

describe("migrateLocale", () => {
  it("moves the old India/English defaults to Automatic", () => {
    const saved = { region: "IN", language: "en" } as Partial<Settings>;
    const s = migrateLocale(merged(saved), saved);
    expect(s.region).toBe("auto");
    expect(s.language).toBe("auto");
    expect(s.localeV2).toBe(true);
  });

  it("keeps a region or language someone picked", () => {
    const saved = { region: "US", language: "hi" } as Partial<Settings>;
    const s = migrateLocale(merged(saved), saved);
    expect(s.region).toBe("US");
    expect(s.language).toBe("hi");
  });
});
