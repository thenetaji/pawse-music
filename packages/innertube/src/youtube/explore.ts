import type { ExploreFeed, MoodTile, Shelf } from "@pawse/music-core";

import { arr, browseOf, dig, text, unwrap } from "./nodes";
import { encodeBrowse, parseSectionList, tab0 } from "./parse";

export const MOOD_CATEGORY = "FEmusic_moods_and_genres_category";

const sections = (json: unknown): unknown[] => arr(dig(tab0(json), "contents"));

/** ARGB int (4283058762) to "#rrggbb". */
export function argbToHex(argb: unknown): string | undefined {
  if (typeof argb !== "number" || !Number.isFinite(argb)) return undefined;
  return `#${(argb & 0xffffff).toString(16).padStart(6, "0")}`;
}

/** Splits an encoded mood token ("FEmusic_moods_and_genres_category|params") or raw params. */
export function moodParams(tokenOrParams: string): string {
  const i = tokenOrParams.indexOf("|");
  return i < 0 ? tokenOrParams : tokenOrParams.slice(i + 1);
}

function moodTile(v: unknown, section?: string): MoodTile | undefined {
  const n = dig(v, "musicNavigationButtonRenderer");
  const b = browseOf(n?.clickCommand);
  const title = text(n?.buttonText).trim();
  if (b.browseId !== MOOD_CATEGORY || !b.params || !title) return undefined;
  return {
    title,
    params: encodeBrowse(MOOD_CATEGORY, b.params),
    color: argbToHex(n.solid?.leftStripeColor ?? n.buttonColor),
    ...(section ? { section } : {}),
  };
}

const tilesOf = (list: unknown, section?: string): MoodTile[] =>
  arr(list)
    .map((v) => moodTile(v, section))
    .filter((t): t is MoodTile => !!t);

const innerOf = (section: unknown) => {
  const u = unwrap(section);
  return u && arr(u.node.contents ?? u.node.items);
};

export function parseExplore(json: unknown): ExploreFeed {
  const list = sections(json);
  const moods = list.flatMap((s) => tilesOf(innerOf(s)));
  return { shelves: parseSectionList(list), moods };
}

export function parseMoodsAndGenres(json: unknown): MoodTile[] {
  return sections(json).flatMap((s) => {
    const header = dig(
      unwrap(s)?.node,
      "header",
      "gridHeaderRenderer",
      "title",
    );
    return tilesOf(innerOf(s), text(header) || undefined);
  });
}

export const parseMoodPage = (json: unknown): Shelf[] =>
  parseSectionList(sections(json));

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Latin-1 string of a base64 payload; dependency-free for React Native. */
function atobLoose(input: string): string {
  const clean = input.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((acc >> bits) & 0xff);
    }
  }
  return out;
}

/** Country code hidden in a menu option's formItemEntityKey ("…country_menu_<digits>IN"). */
function countryCode(key: unknown): string | undefined {
  if (typeof key !== "string") return undefined;
  let raw = key;
  try {
    raw = decodeURIComponent(key);
  } catch {
    // Keep the key as sent.
  }
  return atobLoose(raw).match(/country_menu_\d+([A-Z]{2})/)?.[1];
}

export interface ChartsParse {
  country: { code: string; title: string };
  countries: { code: string; title: string }[];
  shelves: Shelf[];
}

export function parseCharts(json: unknown, requested = "ZZ"): ChartsParse {
  const list = sections(json);
  const button = list
    .flatMap((s) => arr(dig(unwrap(s)?.node, "subheaders")))
    .flatMap((h) => arr(dig(h, "musicSideAlignedItemRenderer", "startItems")))
    .map((i) => dig(i, "musicSortFilterButtonRenderer"))
    .find(Boolean);
  const countries: ChartsParse["countries"] = [];
  const seen = new Set<string>();
  for (const o of arr(
    dig(button, "menu", "musicMultiSelectMenuRenderer", "options"),
  )) {
    const r = dig(o, "musicMultiSelectMenuItemRenderer");
    const code = countryCode(r?.formItemEntityKey);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    countries.push({ code, title: text(r.title) });
  }
  const selectedTitle = text(button?.title);
  const country = countries.find((c) => c.title === selectedTitle) ??
    countries.find((c) => c.code === requested) ?? {
      code: requested,
      title: selectedTitle,
    };
  return { country, countries, shelves: parseSectionList(list) };
}

/** The new-releases grid as one "New releases" shelf of albums. */
export function parseNewReleases(json: unknown): Shelf[] {
  const shelves = parseSectionList(sections(json));
  if (shelves[0] && !shelves[0].title) shelves[0].title = "New releases";
  return shelves;
}
