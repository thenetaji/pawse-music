import {
  classifyLanguages,
  type LangSong,
  looksEnglish,
  scriptLanguage,
  tagLanguage,
} from "./language";

describe("scriptLanguage", () => {
  it.each([
    ["तुम ही हो", "hi"],
    ["ਪੰਜਾਬੀ ਗੀਤ", "pa"],
    ["사랑해", "ko"],
    ["காதல் பாடல்", "ta"],
    ["ప్రేమ గీతం", "te"],
    ["আমার সোনার বাংলা", "bn"],
    ["夜に駆ける", "ja"],
    ["ありがとう", "ja"],
    ["月亮代表我的心", "zh"],
    ["أحبك", "ar"],
    ["پیار ہے", "ur"],
    ["Группа крови", "ru"],
    ["Стефанія", "uk"],
  ])("reads %s as %s", (text, lang) => {
    expect(scriptLanguage(text)).toBe(lang);
  });

  it("has no answer for Latin text or a stray symbol", () => {
    expect(scriptLanguage("Tum Hi Ho")).toBeUndefined();
    expect(scriptLanguage("Σ Sigma Sigma Sigma")).toBeUndefined();
    expect(scriptLanguage("12 34 !")).toBeUndefined();
  });

  it("goes with the script that most of the title is in", () => {
    expect(scriptLanguage("Tum Hi Ho तुम ही हो")).toBe("hi");
  });
});

describe("looksEnglish", () => {
  it("needs the title's own words to be English", () => {
    expect(looksEnglish("Love Story")).toBe(true);
    expect(looksEnglish("Don't Stop The Music (feat. Someone)")).toBe(true);
    expect(looksEnglish("Dancing In The Dark - Remastered")).toBe(true);
    expect(looksEnglish("Tum Hi Ho")).toBe(false);
    expect(looksEnglish("Tere Bina Love")).toBe(false);
    expect(looksEnglish("Despacito")).toBe(false);
  });
});

describe("tagLanguage", () => {
  it("reads language from genre tags and tile names", () => {
    expect(tagLanguage("Bollywood")).toBe("hi");
    expect(tagLanguage("k-pop")).toBe("ko");
    expect(tagLanguage("Punjabi Pop")).toBe("pa");
    expect(tagLanguage("rock")).toBeUndefined();
  });
});

const song = (
  key: string,
  title: string,
  artist: string,
  extra: Partial<LangSong> = {},
): LangSong => ({ key, title, artists: [artist], ...extra });

describe("classifyLanguages", () => {
  it("lets script win, then lists and tags", () => {
    const out = classifyLanguages([
      song("a", "तुम ही हो", "Arijit"),
      song("b", "Kesariya", "Someone", { lists: ["chill", "lang:hi"] }),
      song("c", "Gangnam Style", "Psy", { tags: ["k-pop"] }),
    ]);
    expect(out.get("a")).toBe("hi");
    expect(out.get("b")).toBe("hi");
    expect(out.get("c")).toBe("ko");
  });

  it("gives a Latin title the language its artist sings in", () => {
    const out = classifyLanguages([
      song("a", "तेरी मेरी", "Arijit Singh"),
      song("b", "यह जवानी", "Arijit Singh"),
      song("c", "Tum Hi Ho", "Arijit Singh"),
      song("d", "Love Story", "Arijit Singh"),
    ]);
    expect(out.get("c")).toBe("hi");
    // English words are weaker than what the artist's other songs say.
    expect(out.get("d")).toBe("hi");
  });

  it("uses songs outside the list to know the artist", () => {
    const list = [song("x", "Tum Hi Ho", "Arijit Singh")];
    const context = [
      song("a", "तेरी मेरी", "Arijit Singh"),
      song("b", "यह जवानी", "Arijit Singh"),
    ];
    expect(classifyLanguages(list).has("x")).toBe(false);
    expect(classifyLanguages(list, context).get("x")).toBe("hi");
    expect(classifyLanguages(list, context).has("a")).toBe(false);
  });

  it("calls English only on English words, and leaves the rest unsorted", () => {
    const out = classifyLanguages([
      song("a", "Love Story", "Taylor Swift"),
      song("b", "Despacito", "Luis Fonsi"),
    ]);
    expect(out.get("a")).toBe("en");
    expect(out.has("b")).toBe(false);
  });

  it("does not follow an artist whose songs are in several languages", () => {
    const out = classifyLanguages([
      song("a", "사랑해", "Mix"),
      song("b", "तुम ही हो", "Mix"),
      song("c", "Kesariya", "Mix"),
    ]);
    expect(out.has("c")).toBe(false);
  });
});
