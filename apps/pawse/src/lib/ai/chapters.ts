import type { CaptionCue } from "@pawse/music-core";

import { chunkCues, groupCues, parseStamp, stamped } from "./chunks";

export type Chapter = { startSec: number; title: string };
export type Respond = (
  prompt: string,
  context: string,
) => Promise<string | null>;

export const AUTO_CHAPTERS_MIN_SEC = 20 * 60;
const WINDOW_TOKENS = 1400;
const MAX_WINDOWS = 24;
const MIN_GAP_SEC = 120;
const MIN_CHAPTERS = 3;

export const CHAPTER_CONTEXT =
  `You split a video transcript into chapters. Each line starts with a [m:ss] timestamp. ` +
  `Reply with only a JSON array of 1 or 2 objects like {"at":"m:ss","title":"Topic"}, one for each new topic that starts in the text. ` +
  `"at" is a timestamp copied from the text. A title is at most 6 words, in the language of the text.`;

function jsonOf(reply: string, open: string, close: string): unknown {
  const from = reply.indexOf(open);
  const to = reply.lastIndexOf(close);
  if (from < 0 || to <= from) return undefined;
  try {
    return JSON.parse(reply.slice(from, to + 1));
  } catch {
    return undefined;
  }
}

const cleanTitle = (title: unknown) =>
  String(title ?? "")
    .replace(/["“”]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.:;,]+$/, "")
    .slice(0, 60);

export const secOf = (at: unknown): number | undefined => {
  if (typeof at === "number") return Number.isFinite(at) ? at : undefined;
  if (typeof at !== "string") return undefined;
  return (
    parseStamp(at) ?? (Number.isFinite(Number(at)) ? Number(at) : undefined)
  );
};

export function parseChapters(
  reply: string,
  from: number,
  to: number,
): Chapter[] {
  const raw = jsonOf(reply, "[", "]");
  const list = Array.isArray(raw) ? raw : [];
  const out: Chapter[] = [];
  for (const item of list) {
    const startSec = secOf((item as { at?: unknown })?.at);
    const title = cleanTitle((item as { title?: unknown })?.title);
    if (startSec === undefined || !title) continue;
    if (startSec < from - 5 || startSec > to + 5) continue;
    out.push({ startSec: Math.max(0, Math.round(startSec)), title });
  }
  return out;
}

export function mergeChapters(
  found: Chapter[],
  durationSec: number,
): Chapter[] {
  const sorted = [...found].sort((a, b) => a.startSec - b.startSec);
  let kept: Chapter[] = [];
  for (const c of sorted) {
    const last = kept.at(-1);
    if (
      last &&
      (c.startSec - last.startSec < MIN_GAP_SEC || c.title === last.title)
    )
      continue;
    kept.push(c);
  }
  const most = Math.max(MIN_CHAPTERS, Math.floor(durationSec / 180));
  if (kept.length > most)
    kept = Array.from(
      { length: most },
      (_, i) => kept[Math.floor((i * kept.length) / most)],
    );
  if (kept.length < MIN_CHAPTERS) return [];
  return [{ ...kept[0], startSec: 0 }, ...kept.slice(1)];
}

export async function makeChapters(
  cues: CaptionCue[],
  durationSec: number,
  respond: Respond,
): Promise<Chapter[]> {
  let windows = chunkCues(groupCues(cues, 12), WINDOW_TOKENS, stamped);
  if (windows.length > MAX_WINDOWS)
    windows = Array.from(
      { length: MAX_WINDOWS },
      (_, i) => windows[Math.floor((i * windows.length) / MAX_WINDOWS)],
    );
  const found: Chapter[] = [];
  for (const w of windows) {
    const reply = await respond(w.text, CHAPTER_CONTEXT);
    if (reply) found.push(...parseChapters(reply, w.start, w.end));
  }
  return mergeChapters(found, durationSec);
}
