import type { CaptionCue } from "@pawse/music-core";

import { CHUNK_TOKENS, chunkCues, packStrings } from "./chunks";

const MAX_CHUNKS = 14;
const MAX_ROUNDS = 4;

const spread = <T>(items: T[], n: number): T[] =>
  items.length <= n
    ? items
    : Array.from(
        { length: n },
        (_, i) => items[Math.floor((i * items.length) / n)],
      );

export async function summarizeTranscript(
  cues: CaptionCue[],
  summarize: (text: string) => Promise<string | null>,
  onProgress?: (done: number, total: number) => void,
): Promise<string | null> {
  const chunks = spread(chunkCues(cues, CHUNK_TOKENS), MAX_CHUNKS).map(
    (c) => c.text,
  );
  if (!chunks.length) return null;
  if (chunks.length === 1) return summarize(chunks[0]);

  let done = 0;
  const total = chunks.length + 1;
  let level: string[] = [];
  for (const text of chunks) {
    const part = await summarize(text);
    onProgress?.(++done, total);
    if (part) level.push(part);
  }
  for (let round = 0; level.length > 1 && round < MAX_ROUNDS; round++) {
    const groups = packStrings(level, CHUNK_TOKENS);
    const next: string[] = [];
    for (const group of groups) {
      const part = await summarize(
        `Notes from consecutive parts of one video:\n\n${group}`,
      );
      if (part) next.push(part);
    }
    onProgress?.(total, total);
    if (groups.length === 1) return next[0] ?? null;
    level = next;
  }
  return level[0] ?? null;
}

export const bulletsOf = (summary: string): string[] =>
  summary
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/\*\*/g, "")
        .trim(),
    )
    .filter(Boolean);
