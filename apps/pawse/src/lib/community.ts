import {
  type Branding,
  type CrowdChapter,
  musicSkips,
  originalTitle,
  type SkipSegment,
  SponsorBlock,
} from "@pawse/innertube";
import type { Track } from "@pawse/music-core";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useState } from "react";

import { appFetch } from "./net";
import { getSetting, useSetting } from "./settings";

// SponsorBlock and DeArrow, looked up by hash prefix so the server never learns which video is playing.
const sb = new SponsorBlock({
  fetch: appFetch,
  sha256: (t) =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, t),
});

const MUSIC = ["music_offtopic"];
const VIDEO = ["sponsor", "selfpromo", "interaction"];
const skips = new Map<string, Promise<SkipSegment[]>>();

function lookup(id: string, categories: string[]): Promise<SkipSegment[]> {
  const key = `${id}:${categories.join(",")}`;
  let p = skips.get(key);
  if (!p) {
    p = sb.segments(id, categories).catch(() => {
      skips.delete(key);
      return [];
    });
    skips.set(key, p);
  }
  return p;
}

/** The talking, intros and outros of a music video, which the music player jumps over. */
export const songSkips = (track: Track): Promise<SkipSegment[]> =>
  track.source === "youtube" && getSetting("skipNonMusic", true)
    ? lookup(track.id, MUSIC).then((s) => musicSkips(s, track.durationSec))
    : Promise.resolve([]);

/** Sponsor reads, self-promotion and "subscribe" reminders in a video. */
export const videoSkips = (id: string): Promise<SkipSegment[]> =>
  getSetting("skipSponsors", true) ? lookup(id, VIDEO) : Promise.resolve([]);

export const sponsorsKnown = (id: string): Promise<boolean> =>
  lookup(id, VIDEO).then((s) => s.some((x) => x.category === "sponsor"));

export const skipNote = (category: string) =>
  category === "music_offtopic"
    ? "Skipped the non-music part"
    : category === "sponsor"
      ? "Skipped a sponsor"
      : "Skipped a plug";

const brands = new Map<string, Branding>();
const pending = new Map<string, Promise<Branding>>();

// oEmbed titles go a few at a time so a long feed doesn't fire them all at once.
const originals = new Map<string, Promise<string | undefined>>();
const waiting: (() => void)[] = [];
let active = 0;
const MAX_ACTIVE = 4;
function turn<T>(work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const go = () => {
      active++;
      work()
        .then(resolve, reject)
        .finally(() => {
          active--;
          waiting.shift()?.();
        });
    };
    if (active < MAX_ACTIVE) go();
    else waiting.push(go);
  });
}
function original(id: string): Promise<string | undefined> {
  let p = originals.get(id);
  if (!p) {
    p = turn(() => originalTitle(id, appFetch)).catch(() => {
      originals.delete(id);
      return undefined;
    });
    originals.set(id, p);
  }
  return p;
}

/** DeArrow's title wins over the uploader's own; `dearrow` marks a title or thumbnail that came from DeArrow. */
export function useBranding(
  id: string,
): (Branding & { dearrow?: boolean }) | undefined {
  const on = useSetting("dearrow", true);
  const keepOriginal = useSetting("originalTitles", true);
  // Held in state, not read from the map at render: the React Compiler would cache a map read.
  const [got, setGot] = useState(() => ({ id, b: brands.get(id) }));
  const [own, setOwn] = useState<{ id: string; title?: string }>();
  useEffect(() => {
    if (!on) return;
    let live = true;
    let p = pending.get(id);
    if (!p) {
      const known = brands.get(id);
      p = known
        ? Promise.resolve(known)
        : sb
            .branding(id)
            .catch(() => ({}) as Branding)
            .then((r) => {
              brands.set(id, r);
              pending.delete(id);
              return r;
            });
      if (!known) pending.set(id, p);
    }
    void p.then((b) => live && setGot({ id, b }));
    return () => {
      live = false;
    };
  }, [id, on]);
  useEffect(() => {
    if (!keepOriginal) return;
    let live = true;
    void original(id).then((title) => live && setOwn({ id, title }));
    return () => {
      live = false;
    };
  }, [id, keepOriginal]);
  const b = on && got.id === id ? got.b : undefined;
  const ownTitle = keepOriginal && own?.id === id ? own.title : undefined;
  return useMemo(
    () =>
      b || ownTitle
        ? { ...b, title: b?.title ?? ownTitle, dearrow: !!b?.title }
        : undefined,
    [b, ownTitle],
  );
}

export const brandingOf = (id: string) => brands.get(id);

const ahead = new Map<string, Promise<unknown>>();
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = ahead.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch(() => {
      ahead.delete(key);
      return undefined as T;
    });
    ahead.set(key, p);
  }
  return p;
}

export function useHighlight(
  id: string,
): { at: number; uuid?: string } | undefined {
  const on = useSetting("sbExtras", true);
  const [got, setGot] = useState<{
    id: string;
    h?: { at: number; uuid?: string };
  }>();
  useEffect(() => {
    if (!on) return;
    let live = true;
    void once(`hl:${id}`, () => sb.highlight(id)).then(
      (h) => live && setGot({ id, h }),
    );
    return () => {
      live = false;
    };
  }, [id, on]);
  return on && got?.id === id ? got.h : undefined;
}

export function useCrowdChapters(
  id: string,
  wanted: boolean,
): CrowdChapter[] | undefined {
  const on = useSetting("sbExtras", true);
  const [got, setGot] = useState<{ id: string; c?: CrowdChapter[] }>();
  useEffect(() => {
    if (!on || !wanted) return;
    let live = true;
    void once(`ch:${id}`, () => sb.chapters(id)).then(
      (c) => live && setGot({ id, c }),
    );
    return () => {
      live = false;
    };
  }, [id, on, wanted]);
  return on && wanted && got?.id === id ? got.c : undefined;
}
