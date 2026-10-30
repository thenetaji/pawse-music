import type { Filter, FilterKind } from "./biquad";

export interface AutoEqEntry {
  name: string;
  /** Measurement source and rig, e.g. "oratory1990" or "crinacle on GRAS 43AG-7". */
  source: string;
  /** Folder under results/, as written in the index (percent-encoded). */
  path: string;
}

const RAW =
  "https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results";
export const INDEX_URL = `${RAW}/INDEX.md`;

// oratory1990 first: it is AutoEq's recommended source.
const SOURCE_ORDER = [
  "oratory1990",
  "crinacle",
  "Rtings",
  "Innerfidelity",
  "Super Review",
];

export function parseIndex(markdown: string): AutoEqEntry[] {
  const out: AutoEqEntry[] = [];
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("- [")) continue;
    const mid = line.lastIndexOf("](./");
    const by = line.lastIndexOf(") by ");
    if (mid < 0 || by < mid) continue;
    out.push({
      name: line.slice(3, mid),
      path: line.slice(mid + 4, by),
      source: line.slice(by + 5).trim(),
    });
  }
  return out;
}

const sourceRank = (e: AutoEqEntry) => {
  const i = SOURCE_ORDER.findIndex(
    (s) => e.source === s || e.source.startsWith(`${s} `),
  );
  return i < 0 ? SOURCE_ORDER.length : i;
};

export function searchIndex(
  entries: AutoEqEntry[],
  query: string,
  limit = 40,
): AutoEqEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const full = query.trim().toLowerCase();
  return entries
    .filter((e) => {
      const n = e.name.toLowerCase();
      return words.every((w) => n.includes(w));
    })
    .sort(
      (a, b) =>
        Number(b.name.toLowerCase().startsWith(full)) -
          Number(a.name.toLowerCase().startsWith(full)) ||
        sourceRank(a) - sourceRank(b) ||
        a.name.length - b.name.length,
    )
    .slice(0, limit);
}

export function profileUrl(entry: AutoEqEntry): string {
  const folder = decodeURIComponent(entry.path.split("/").pop() ?? entry.name);
  return `${RAW}/${entry.path}/${encodeURIComponent(`${folder} ParametricEQ.txt`)}`;
}

const KINDS: Record<string, FilterKind> = {
  PK: "peak",
  LSC: "lowshelf",
  LS: "lowshelf",
  HSC: "highshelf",
  HS: "highshelf",
};
const LINE =
  /^Filter\s*\d*:\s*(ON|OFF)\s+(\w+)\s+Fc\s+([\d.]+)\s*Hz(?:\s+Gain\s+(-?[\d.]+)\s*dB)?(?:\s+Q\s+([\d.]+))?/i;

export function parseParametricEq(
  text: string,
): { preamp: number; filters: Filter[] } | null {
  let preamp = 0;
  const filters: Filter[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const p = /^Preamp:\s*(-?[\d.]+)\s*dB/i.exec(line);
    if (p) {
      preamp = Number(p[1]);
      continue;
    }
    const m = LINE.exec(line);
    const kind = m && KINDS[m[2].toUpperCase()];
    if (!m || !kind || m[1].toUpperCase() !== "ON") continue;
    const freq = Number(m[3]);
    const gain = Number(m[4] ?? 0);
    const q = Number(m[5] ?? Math.SQRT1_2);
    if (freq > 0 && q > 0 && Number.isFinite(gain))
      filters.push({ kind, freq, gain, q });
  }
  return filters.length ? { preamp, filters } : null;
}

export const encodeIndex = (entries: AutoEqEntry[]): string =>
  entries.map((e) => `${e.name}\t${e.path}\t${e.source}`).join("\n");

export function decodeIndex(text: string): AutoEqEntry[] {
  return text.split("\n").flatMap((l) => {
    const [name, path, source] = l.split("\t");
    return name && path ? [{ name, path, source: source ?? "" }] : [];
  });
}
