import type { CaptionCue } from "@pawse/music-core";

// Apple's model has a 4,096-token window for prompt and answer together, Gemini Nano 4,000 for the prompt.
export const CHUNK_TOKENS = 1800;

export const estimateTokens = (text: string): number => {
  let tokens = 0;
  for (const ch of text) tokens += ch.charCodeAt(0) < 0x250 ? 0.27 : 1;
  return Math.ceil(tokens);
};

export function stamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function parseStamp(text: string): number | undefined {
  const parts = text.trim().split(":");
  if (parts.length < 2 || parts.length > 3) return undefined;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0)) return undefined;
  return nums.reduce((total, n) => total * 60 + n, 0);
}

export type Chunk = { start: number; end: number; text: string };

export const plain = (cue: CaptionCue) => cue.text.replace(/\s+/g, " ");
export const stamped = (cue: CaptionCue) =>
  `[${stamp(cue.start)}] ${plain(cue)}`;

export function groupCues(cues: CaptionCue[], spanSec: number): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const cue of cues) {
    const last = out.at(-1);
    if (last && cue.start - last.start < spanSec)
      out[out.length - 1] = {
        start: last.start,
        end: cue.end,
        text: `${plain(last)} ${plain(cue)}`,
      };
    else out.push({ ...cue, text: plain(cue) });
  }
  return out;
}

export function chunkCues(
  cues: CaptionCue[],
  maxTokens: number,
  format: (cue: CaptionCue) => string = plain,
): Chunk[] {
  const out: Chunk[] = [];
  let lines: string[] = [];
  let tokens = 0;
  let start = 0;
  let end = 0;
  const flush = () => {
    if (lines.length) out.push({ start, end, text: lines.join("\n") });
    lines = [];
    tokens = 0;
  };
  for (const cue of cues) {
    const line = format(cue);
    const cost = estimateTokens(line) + 1;
    if (lines.length && tokens + cost > maxTokens) flush();
    if (!lines.length) start = cue.start;
    lines.push(line);
    tokens += cost;
    end = cue.end;
  }
  flush();
  return out;
}
