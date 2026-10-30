import type { CaptionCue } from "@pawse/music-core";

import { estimateTokens, groupCues, parseStamp, stamped } from "./chunks";

const WINDOW_SEC = 30;
const EXCERPT_TOKENS = 1400;
const STOP = new Set(
  "the and for are was were what who whom how why when where which that this these those with from about does did has have had can could would should will you your video say says said into than then they them its not but all any".split(
    " ",
  ),
);

const wordsOf = (text: string): string[] =>
  text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];

export function excerptsFor(
  question: string,
  cues: CaptionCue[],
  maxTokens = EXCERPT_TOKENS,
): string {
  const windows = groupCues(cues, WINDOW_SEC);
  if (!windows.length) return "";
  const terms = [...new Set(wordsOf(question).filter((w) => !STOP.has(w)))];
  const docs = windows.map((w) => wordsOf(w.text));
  const idf = new Map(
    terms.map((t) => {
      const df = docs.filter((d) => d.includes(t)).length;
      return [t, Math.log(1 + windows.length / (1 + df))] as const;
    }),
  );
  const scored = docs.map((d, i) => ({
    i,
    score: terms.reduce(
      (sum, t) => sum + d.filter((w) => w === t).length * (idf.get(t) ?? 0),
      0,
    ),
  }));
  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  const order = matched.length
    ? matched.map((s) => s.i)
    : windows.map((_, i) => i).sort((a, b) => (a % 7) - (b % 7) || a - b);

  const picked: number[] = [];
  let tokens = 0;
  for (const i of order) {
    const cost = estimateTokens(stamped(windows[i])) + 1;
    if (tokens + cost > maxTokens) continue;
    picked.push(i);
    tokens += cost;
  }
  return picked
    .sort((a, b) => a - b)
    .map((i) => stamped(windows[i]))
    .join("\n");
}

export const askContext = (excerpts: string, language: string) =>
  `You answer questions about a video using only these transcript excerpts, each starting with a [m:ss] timestamp. ` +
  `Answer in ${language} in one to three sentences. Put the timestamp an answer comes from in square brackets, like [12:34]. ` +
  `If the excerpts do not say, answer that the video does not cover it.\n\n${excerpts}`;

export type AnswerPart = { text: string; sec?: number };

export function answerParts(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const m of answer.matchAll(/[[(](\d{1,2}(?::\d{2}){1,2})[\])]/g)) {
    const sec = parseStamp(m[1]);
    if (sec === undefined) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push({ text: answer.slice(last, at) });
    parts.push({ text: m[1], sec });
    last = at + m[0].length;
  }
  if (last < answer.length) parts.push({ text: answer.slice(last) });
  return parts;
}
