import { kv } from "../../data/storage";
import {
  type AutoEqEntry,
  decodeIndex,
  encodeIndex,
  INDEX_URL,
  parseIndex,
  parseParametricEq,
  profileUrl,
} from "./autoeq";
import type { HeadphoneProfile } from "./eq";

const INDEX_KEY = "pawse.autoeq.index";
const MAX_AGE_MS = 30 * 24 * 3600_000;

let memory: AutoEqEntry[] | null = null;

async function get(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AutoEq answered ${res.status}`);
  return res.text();
}

export async function loadIndex(): Promise<AutoEqEntry[]> {
  if (memory) return memory;
  const saved = await kv.get(INDEX_KEY).catch(() => null);
  const at = saved ? Number(saved.slice(0, saved.indexOf("\n"))) : 0;
  const cached = saved ? decodeIndex(saved.slice(saved.indexOf("\n") + 1)) : [];
  if (cached.length && Date.now() - at < MAX_AGE_MS) return (memory = cached);
  try {
    const fresh = parseIndex(await get(INDEX_URL));
    if (!fresh.length) throw new Error("AutoEq list was empty");
    await kv
      .set(INDEX_KEY, `${Date.now()}\n${encodeIndex(fresh)}`)
      .catch(() => {});
    return (memory = fresh);
  } catch (e) {
    if (cached.length) return (memory = cached);
    throw e;
  }
}

export async function loadProfile(
  entry: AutoEqEntry,
): Promise<HeadphoneProfile> {
  const parsed = parseParametricEq(await get(profileUrl(entry)));
  if (!parsed) throw new Error("No equaliser found for this model");
  return { name: entry.name, source: entry.source, ...parsed };
}
