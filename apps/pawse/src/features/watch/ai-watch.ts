import { fetchCaptions } from "@pawse/innertube";
import type { CaptionCue, CaptionTrack, VideoDetail } from "@pawse/music-core";
import { useEffect, useMemo, useState } from "react";

import { kv } from "../../data/storage";
import {
  AUTO_CHAPTERS_MIN_SEC,
  type Chapter,
  makeChapters,
} from "../../lib/ai/chapters";
import {
  modelLanguage,
  respondInBackground,
  useAiFeature,
} from "../../lib/ai/model";
import { findSponsors, type SponsorSpot } from "../../lib/ai/sponsors";
import { sponsorsKnown } from "../../lib/community";
import { useLanguage } from "../../lib/locale";
import { appFetch } from "../../lib/net";
import { pick } from "./captions";

const KEPT_TRANSCRIPTS = 3;
const START_DELAY_MS = 3000;
const transcripts = new Map<string, Promise<CaptionCue[]>>();

export function loadTranscript(
  id: string,
  tracks: CaptionTrack[],
  language: string,
): Promise<CaptionCue[]> {
  const choice = pick(tracks, modelLanguage(language));
  if (!choice) return Promise.resolve([]);
  const key = `${id}:${choice.track.lang}:${choice.translate ?? ""}`;
  let cues = transcripts.get(key);
  if (!cues) {
    cues = fetchCaptions(choice.track, {
      fetch: appFetch,
      translate: choice.translate,
    }).catch(() => {
      transcripts.delete(key);
      return [];
    });
    transcripts.set(key, cues);
    if (transcripts.size > KEPT_TRANSCRIPTS)
      transcripts.delete(transcripts.keys().next().value!);
  }
  return cues;
}

/** Fetches the captions as the page opens, so Summary and Ask find them ready. */
export function useCaptionPrefetch(
  id: string,
  tracks: CaptionTrack[] | undefined,
  on: boolean,
) {
  const language = useLanguage();
  useEffect(() => {
    if (on && tracks?.length) void loadTranscript(id, tracks, language);
    // The track list is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, on, !!tracks?.length, language]);
}

async function remembered<T>(key: string, make: () => Promise<T | undefined>) {
  const saved = await kv.get(key);
  if (saved)
    try {
      return JSON.parse(saved) as T;
    } catch {
      // An unreadable entry is made again.
    }
  const made = await make();
  if (made) await kv.set(key, JSON.stringify(made));
  return made;
}

export function useAiChapters(
  id: string,
  tracks: CaptionTrack[] | undefined,
  durationSec: number | undefined,
  detail: VideoDetail | undefined,
): VideoDetail | undefined {
  const language = useLanguage();
  const on = useAiFeature("aiChapters", true);
  const wanted =
    on &&
    !!detail &&
    !detail.chapters.length &&
    !!tracks?.length &&
    (durationSec ?? 0) >= AUTO_CHAPTERS_MIN_SEC;
  const [made, setMade] = useState<{ id: string; chapters: Chapter[] }>();

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    // Community chapters arrive a moment after the page; wait so they get the first say.
    const timer = setTimeout(() => {
      void remembered<Chapter[]>(`ai-chapters:${id}`, async () => {
        const cues = await loadTranscript(id, tracks!, language);
        if (!cues.length) return undefined;
        const chapters = await makeChapters(
          cues,
          durationSec!,
          respondInBackground,
        );
        return chapters.length ? chapters : undefined;
      }).then((chapters) => live && chapters && setMade({ id, chapters }));
    }, START_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // The video and whether it needs chapters decide this; the track list is a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, wanted]);

  return useMemo(
    () =>
      detail && made?.id === id && !detail.chapters.length
        ? {
            ...detail,
            chapters: made.chapters.map((c) => ({ ...c, ai: true })),
          }
        : detail,
    [detail, made, id],
  );
}

const NO_SPOTS: SponsorSpot[] = [];

export function useSponsorSpots(
  id: string,
  tracks: CaptionTrack[] | undefined,
): SponsorSpot[] {
  const language = useLanguage();
  const on = useAiFeature("aiSponsors", true);
  const hasTracks = !!tracks?.length;
  const [found, setFound] = useState<{ id: string; spots: SponsorSpot[] }>();

  useEffect(() => {
    if (!on || !hasTracks) return;
    let live = true;
    const timer = setTimeout(async () => {
      if (await sponsorsKnown(id)) return;
      const spots = await remembered<SponsorSpot[]>(
        `ai-sponsors:${id}`,
        async () => {
          const cues = await loadTranscript(id, tracks!, language);
          const spots = await findSponsors(cues, respondInBackground);
          return spots.length ? spots : undefined;
        },
      );
      if (live && spots) setFound({ id, spots });
    }, START_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, on, hasTracks]);

  return found?.id === id ? found.spots : NO_SPOTS;
}
