import type { CaptionCue } from "@pawse/music-core";

import {
  CHUNK_TOKENS,
  type Chunk,
  chunkCues,
  groupCues,
  parseStamp,
  stamped,
} from "./chunks";

// A long video is sampled evenly down to this many parts, so the work has a ceiling.
const MAX_CHUNKS = 8;
const LINE_SEC = 30;
const STAMP = /[[(](\d{1,2}(?::\d{2}){1,2})[\])]/g;

export type Bullet = { sec: number; text: string };

const spread = <T>(items: T[], n: number): T[] =>
  items.length <= n
    ? items
    : Array.from(
        { length: n },
        (_, i) => items[Math.floor((i * items.length) / n)],
      );

export const summaryChunks = (cues: CaptionCue[]): Chunk[] =>
  spread(
    chunkCues(groupCues(cues, LINE_SEC), CHUNK_TOKENS, stamped),
    MAX_CHUNKS,
  );

const bulletCount = (chunks: number) =>
  chunks === 1 ? 4 : chunks <= 4 ? 3 : 2;

export const summaryContext = (language: string, count: number) =>
  `Write ${count} short bullet points in ${language} about the video transcript you are given. ` +
  `Start each with "- " and the [m:ss] of the transcript line it comes from. Use only what the text says.`;

/** The bullets in a reply, each at the time it names, or at the start of the part when it names none. */
export function bulletsOf(reply: string, chunk: Chunk): Bullet[] {
  const lines = reply.split("\n").map((l) => l.trim());
  const marked = lines.filter((l) => /^(?:[-*•]|\d+[.)])\s/.test(l));
  const out: Bullet[] = [];
  for (const line of marked.length ? marked : lines) {
    const secs = [...line.matchAll(STAMP)].map((m) => parseStamp(m[1]));
    const sec = secs.find(
      (s): s is number => s !== undefined && s >= chunk.start && s <= chunk.end,
    );
    const text = line
      .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
      .replace(STAMP, "")
      .replace(/\*\*/g, "")
      .replace(/^[\s\-–:,.]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push({ sec: sec ?? chunk.start, text });
  }
  return out.sort((a, b) => a.sec - b.sec);
}

/** Summarises the parts of a transcript in order, handing over each part's bullets as soon as they are made. */
export async function summarizeTranscript(
  cues: CaptionCue[],
  summarize: (text: string, count: number) => Promise<string | null>,
  onPart: (bullets: Bullet[], done: number, total: number) => void,
): Promise<number> {
  const chunks = summaryChunks(cues);
  const count = bulletCount(chunks.length);
  let made = 0;
  for (const [i, chunk] of chunks.entries()) {
    const reply = await summarize(chunk.text, count);
    const bullets = reply ? bulletsOf(reply, chunk) : [];
    made += bullets.length;
    onPart(bullets, i + 1, chunks.length);
  }
  return made;
}
