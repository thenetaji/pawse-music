import { songVibe } from "./vibe";

const t = (title: string, album?: string) => ({
  id: "x",
  source: "youtube" as const,
  title,
  artists: [{ name: "A" }],
  album: album ? { id: "a", title: album } : undefined,
  thumbnails: [],
});

describe("songVibe", () => {
  it("reads clear words in the title", () => {
    expect(songVibe(t("Blinding Lights (Ultra Slowed)"))).toBe("vibe");
    expect(songVibe(t("Starboy (Phonk Remix)"))).toBe("hype");
    expect(songVibe(t("Tum Hi Ho", "Aashiqui 2 - Dil"))).toBe("love");
    expect(songVibe(t("Someone Like You (Sad Version)"))).toBe("sad");
  });
  it("prefers the mood the queue came from", () => {
    expect(songVibe(t("Levitating"), "Workout")).toBe("hype");
    expect(songVibe(t("Levitating"), "Chill")).toBe("vibe");
  });
  it("keeps plain songs grooving", () => {
    expect(songVibe(t("Blinding Lights"))).toBe("groove");
    expect(songVibe(t("Shape of You"), "Quick picks")).toBe("groove");
  });
});
