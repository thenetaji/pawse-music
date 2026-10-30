import { useEffect, useState } from "react";

import { type AiStatus, PawseAI } from "../../../modules/pawse-ai";
import { languageName } from "../locale";
import { useSetting } from "../settings";

export type AiFeature = "aiSummary" | "aiDj" | "aiChapters" | "aiSponsors";

let known: Promise<AiStatus> | undefined;
export const aiStatus = (fresh = false): Promise<AiStatus> =>
  (known = fresh || !known ? PawseAI.status() : known);

export function useAiStatus(): AiStatus | undefined {
  const [status, setStatus] = useState<AiStatus>();
  useEffect(() => {
    let live = true;
    void aiStatus().then((s) => live && setStatus(s));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

export function useAiFeature(feature: AiFeature, background = false): boolean {
  const on = useSetting(feature, false);
  const status = useAiStatus();
  if (!on || !status) return false;
  return background ? status === "ready" : status !== "unavailable";
}

export const downloadModel = async (): Promise<boolean> => {
  const ok = await PawseAI.download();
  void aiStatus(true);
  return ok;
};

let tail: Promise<unknown> = Promise.resolve();
let waiting = 0;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

// One request at a time; background work steps aside whenever you are waiting for an answer.
function enqueue<T>(task: () => Promise<T>, urgent: boolean): Promise<T> {
  if (urgent) waiting++;
  const result = tail.then(async () => {
    while (!urgent && waiting > 0) await pause(400);
    try {
      return await task();
    } finally {
      if (urgent) waiting--;
    }
  });
  tail = result.catch(() => undefined);
  return result;
}

export const summarize = (text: string, language: string) =>
  enqueue(() => PawseAI.summarize(text, language), true);

export const respond = (prompt: string, context: string) =>
  enqueue(() => PawseAI.respond(prompt, context), true);

export const respondInBackground = (prompt: string, context: string) =>
  enqueue(() => PawseAI.respond(prompt, context), false);

export const modelLanguage = (code: string) =>
  PawseAI.supportsLanguage(code) ? code : "en";

export const modelLanguageName = (code: string) =>
  languageName(modelLanguage(code));
