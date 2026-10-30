export type LangId =
  | "en"
  | "hi"
  | "pa"
  | "bn"
  | "ta"
  | "te"
  | "kn"
  | "ml"
  | "gu"
  | "ur"
  | "ko"
  | "ja"
  | "zh"
  | "ar"
  | "ru"
  | "uk"
  | "el"
  | "he"
  | "th"
  | "es"
  | "pt"
  | "fr"
  | "de"
  | "it"
  | "tr";

export const LANGUAGE_NAMES: Record<LangId, string> = {
  en: "English",
  hi: "Hindi",
  pa: "Punjabi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  kn: "Kannada",
  ml: "Malayalam",
  gu: "Gujarati",
  ur: "Urdu",
  ko: "Korean",
  ja: "Japanese",
  zh: "Chinese",
  ar: "Arabic",
  ru: "Russian",
  uk: "Ukrainian",
  el: "Greek",
  he: "Hebrew",
  th: "Thai",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  tr: "Turkish",
};

type Script =
  | "deva"
  | "beng"
  | "guru"
  | "gujr"
  | "taml"
  | "telu"
  | "knda"
  | "mlym"
  | "thai"
  | "hang"
  | "kana"
  | "han"
  | "arab"
  | "hebr"
  | "cyrl"
  | "grek";

const RANGES: [from: number, to: number, script: Script][] = [
  [0x0370, 0x03ff, "grek"],
  [0x0400, 0x052f, "cyrl"],
  [0x0590, 0x05ff, "hebr"],
  [0x0600, 0x06ff, "arab"],
  [0x0750, 0x077f, "arab"],
  [0xfb50, 0xfdff, "arab"],
  [0xfe70, 0xfeff, "arab"],
  [0x0900, 0x097f, "deva"],
  [0x0980, 0x09ff, "beng"],
  [0x0a00, 0x0a7f, "guru"],
  [0x0a80, 0x0aff, "gujr"],
  [0x0b80, 0x0bff, "taml"],
  [0x0c00, 0x0c7f, "telu"],
  [0x0c80, 0x0cff, "knda"],
  [0x0d00, 0x0d7f, "mlym"],
  [0x0e00, 0x0e7f, "thai"],
  [0x1100, 0x11ff, "hang"],
  [0x3130, 0x318f, "hang"],
  [0xac00, 0xd7af, "hang"],
  [0x3040, 0x30ff, "kana"],
  [0x31f0, 0x31ff, "kana"],
  [0x3400, 0x4dbf, "han"],
  [0x4e00, 0x9fff, "han"],
];

const scriptAt = (code: number): Script | undefined =>
  RANGES.find(([from, to]) => code >= from && code <= to)?.[2];

const SCRIPT_LANG: Record<Script, LangId> = {
  deva: "hi",
  beng: "bn",
  guru: "pa",
  gujr: "gu",
  taml: "ta",
  telu: "te",
  knda: "kn",
  mlym: "ml",
  thai: "th",
  hang: "ko",
  hebr: "he",
  grek: "el",
  kana: "ja",
  han: "zh",
  arab: "ar",
  cyrl: "ru",
};

// Letters only Urdu writes, so Arabic script with one of them is Urdu.
const URDU_ONLY = /[\u0679\u0688\u0691\u06ba\u06be\u06d2]/;
const UKRAINIAN_ONLY = /[іїєґІЇЄҐ]/;
// A little non-Latin text in a mostly Latin title (a symbol, one borrowed letter) says nothing.
const MIN_SHARE = 0.3;

/** The language a text's script points to; Latin text has none. */
export function scriptLanguage(text: string): LangId | undefined {
  const count = new Map<Script, number>();
  let letters = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x41) continue;
    const script = scriptAt(code);
    if (script) count.set(script, (count.get(script) ?? 0) + 1);
    if (script || /\p{L}/u.test(ch)) letters++;
  }
  if (!letters) return undefined;
  // Japanese mixes kana with Han; Han alone is Chinese.
  if ((count.get("kana") ?? 0) / letters >= MIN_SHARE) return "ja";
  const top = [...count].sort((x, y) => y[1] - x[1])[0];
  if (!top || top[1] / letters < MIN_SHARE) return undefined;
  const [script] = top;
  if (script === "arab" && URDU_ONLY.test(text)) return "ur";
  if (script === "cyrl" && UKRAINIAN_ONLY.test(text)) return "uk";
  return SCRIPT_LANG[script];
}

// Genre and language tags (MusicBrainz, Last.fm) and YouTube Music genre tile names.
const TAG_LANGUAGE: [RegExp, LangId][] = [
  [/bollywood|hindi|filmi/, "hi"],
  [/punjabi|bhangra/, "pa"],
  [/tamil|kollywood/, "ta"],
  [/telugu|tollywood/, "te"],
  [/kannada|sandalwood/, "kn"],
  [/malayalam|mollywood/, "ml"],
  [/bengali|bangla/, "bn"],
  [/gujarati/, "gu"],
  [/urdu|ghazal|qawwali/, "ur"],
  [/k-?pop|korean/, "ko"],
  [/j-?pop|j-?rock|japanese|anime|city pop/, "ja"],
  [/mandopop|cantopop|c-?pop|chinese|mandarin|cantonese/, "zh"],
  [/arabic|khaleeji/, "ar"],
  [/spanish|reggaeton|bachata|salsa|cumbia|corrido|flamenco/, "es"],
  [/portuguese|brazil|mpb|bossa nova|samba|sertanejo|forr[oó]/, "pt"],
  [/french|chanson/, "fr"],
  [/german|schlager|deutsch/, "de"],
  [/italian/, "it"],
  [/turkish|t[uü]rk/, "tr"],
  [/russian/, "ru"],
];

export const tagLanguage = (tag: string): LangId | undefined => {
  const t = tag.toLowerCase();
  return TAG_LANGUAGE.find(([re]) => re.test(t))?.[1];
};

export const languageList = (id: LangId) => `lang:${id}`;
const fromList = (id: string): LangId | undefined => {
  if (!id.startsWith("lang:")) return undefined;
  const lang = id.slice(5);
  return lang in LANGUAGE_NAMES ? (lang as LangId) : undefined;
};

// Words that are English and nothing else; "do", "to", "me", "main" and "hum" are left out because Hindi, Spanish and others spell them too.
const ENGLISH = new Set(
  `the you your yours my mine love baby night nights heart hearts girl boy woman time life world feel feeling feelings never always forever dance dancing fire down back home tonight again dont cant wont im ill ive its we are were with without from that this what when where why how all one only just like know want need take give make let go get got say stay run fall break burn cry lost alone blue black white red gold golden sky rain moon star stars hold close together dream dreams sweet little crazy happy sorry kiss touch wild free light dark shadow ocean summer winter morning day days angel devil money party remember tell think believe call away here there now still some any every too very more most better best good bad`.split(
    " ",
  ),
);

// The part of a title that is the song's own words: no "(feat. X)" or "- Remastered".
const words = (title: string): string[] =>
  title
    .toLowerCase()
    .replace(/[([].*?[)\]]/g, " ")
    .replace(/\s-\s.*$/, " ")
    .replace(/['’]/g, "")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);

export function looksEnglish(title: string): boolean {
  const ws = words(title);
  const hits = ws.filter((w) => ENGLISH.has(w)).length;
  return hits > 0 && hits / ws.length >= 0.5;
}

export type LangSong = {
  key: string;
  title: string;
  artists: string[];
  /** YouTube Music list ids the song was found in. */
  lists?: string[];
  tags?: string[];
};

type Direct = { lang: LangId; strong: boolean };

function direct(s: LangSong): Direct | undefined {
  const lang =
    scriptLanguage(s.title) ??
    scriptLanguage(s.artists.join(" ")) ??
    s.lists?.map(fromList).find(Boolean) ??
    s.tags?.map(tagLanguage).find(Boolean);
  if (lang) return { lang, strong: true };
  return looksEnglish(s.title) ? { lang: "en", strong: false } : undefined;
}

const STRONG_VOTE = 2;
const WEAK_VOTE = 1;
// Needs more than one weak vote, and most of them agreeing.
const MIN_VOTES = 2;
const MIN_SHARE_OF_VOTES = 0.6;

const artistOf = (s: LangSong) => s.artists[0]?.toLowerCase().trim();

/**
 * Songs whose language can be told, by key. Evidence, strongest first: the title's script,
 * the YouTube Music language lists and tags, the language the artist's other songs are in, and
 * English words in the title. `context` songs only vote for their artists.
 */
export function classifyLanguages(
  songs: LangSong[],
  context: LangSong[] = [],
): Map<string, LangId> {
  const seen = new Map<string, Direct | undefined>();
  const votes = new Map<string, Map<LangId, number>>();
  for (const s of [...songs, ...context]) {
    if (seen.has(s.key)) continue;
    const d = direct(s);
    seen.set(s.key, d);
    const artist = artistOf(s);
    if (!d || !artist) continue;
    const mine = votes.get(artist) ?? new Map<LangId, number>();
    mine.set(
      d.lang,
      (mine.get(d.lang) ?? 0) + (d.strong ? STRONG_VOTE : WEAK_VOTE),
    );
    votes.set(artist, mine);
  }

  const usual = (artist: string | undefined): LangId | undefined => {
    const mine = artist ? votes.get(artist) : undefined;
    if (!mine) return undefined;
    const total = [...mine.values()].reduce((a, b) => a + b, 0);
    const [lang, n] = [...mine].sort((a, b) => b[1] - a[1])[0];
    return total >= MIN_VOTES && n / total >= MIN_SHARE_OF_VOTES
      ? lang
      : undefined;
  };

  const out = new Map<string, LangId>();
  for (const s of songs) {
    const d = seen.get(s.key);
    const lang = d?.strong ? d.lang : (usual(artistOf(s)) ?? d?.lang);
    if (lang) out.set(s.key, lang);
  }
  return out;
}
