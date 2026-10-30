import type { CaptionTrack } from "@pawse/music-core";
import { create } from "zustand";

import { kv } from "../../data/storage";
import {
  aiStatus,
  modelLanguage,
  modelLanguageName,
  respond,
} from "../../lib/ai/model";
import {
  type Bullet,
  summarizeTranscript,
  summaryContext,
} from "../../lib/ai/summary";
import { loadTranscript } from "./ai-watch";

const KEY = "pawse.ai.summaries";
const KEPT = 30;

export type SummaryJob =
  | { state: "reading" }
  | { state: "working"; bullets: Bullet[]; done: number; total: number }
  | { state: "done"; bullets: Bullet[] }
  | { state: "failed" | "empty" };

// Finished summaries, oldest first; the last few are kept across launches.
const saved = new Map<string, Bullet[]>(restore());

function restore(): [string, Bullet[]][] {
  try {
    const raw = kv.getItem(KEY);
    const list = typeof raw === "string" ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter(
          (e): e is [string, Bullet[]] =>
            Array.isArray(e) &&
            typeof e[0] === "string" &&
            Array.isArray(e[1]) &&
            e[1].every((b: Bullet) => typeof b?.sec === "number" && !!b.text),
        )
      : [];
  } catch {
    return [];
  }
}

function keep(key: string, bullets: Bullet[]) {
  saved.delete(key);
  saved.set(key, bullets);
  while (saved.size > KEPT) saved.delete(saved.keys().next().value!);
  void kv.set(KEY, JSON.stringify([...saved])).catch(() => {});
}

// Jobs live here, not in the sheet, so closing it leaves one running and reopening shows where it got to.
export const useSummaries = create<Record<string, SummaryJob>>(() =>
  Object.fromEntries(
    [...saved].map(([key, bullets]) => [key, { state: "done", bullets }]),
  ),
);

export const summaryKey = (id: string, language: string) =>
  `${id}:${modelLanguage(language)}`;

const set = (key: string, job: SummaryJob) =>
  useSummaries.setState({ [key]: job });

/** Starts the summary unless it is running or made; a failed one is tried again. */
export function startSummary(
  id: string,
  tracks: CaptionTrack[],
  language: string,
) {
  const key = summaryKey(id, language);
  const now = useSummaries.getState()[key];
  if (now && now.state !== "failed" && now.state !== "empty") return;
  set(key, { state: "reading" });
  void (async () => {
    try {
      if ((await aiStatus()) !== "ready") return set(key, { state: "failed" });
      const cues = await loadTranscript(id, tracks, language);
      if (!cues.length) return set(key, { state: "empty" });
      const name = modelLanguageName(language);
      const bullets: Bullet[] = [];
      const made = await summarizeTranscript(
        cues,
        (text, count) => respond(text, summaryContext(name, count)),
        (part, done, total) => {
          bullets.push(...part);
          set(key, { state: "working", bullets: [...bullets], done, total });
        },
      );
      if (!made) return set(key, { state: "failed" });
      set(key, { state: "done", bullets });
      keep(key, bullets);
    } catch {
      set(key, { state: "failed" });
    }
  })();
}
