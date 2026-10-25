import {
  type Branding,
  type SkipSegment,
  SponsorBlock,
} from "@pawse/innertube";
import type { Track } from "@pawse/music-core";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";

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
    ? lookup(track.id, MUSIC)
    : Promise.resolve([]);

/** Sponsor reads, self-promotion and "subscribe" reminders in a video. */
export const videoSkips = (id: string): Promise<SkipSegment[]> =>
  getSetting("skipSponsors", true) ? lookup(id, VIDEO) : Promise.resolve([]);

export const skipNote = (category: string) =>
  category === "music_offtopic"
    ? "Skipped the non-music part"
    : category === "sponsor"
      ? "Skipped a sponsor"
      : "Skipped a plug";

const brands = new Map<string, Branding>();
const pending = new Map<string, Promise<Branding>>();

/** DeArrow's title and thumbnail for a video, when that setting is on and the community has one. */
export function useBranding(id: string): Branding | undefined {
  const on = useSetting("dearrow", true);
  // Held in state, not read from the map at render: the React Compiler would cache a map read.
  const [got, setGot] = useState(() => ({ id, b: brands.get(id) }));
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
  return on && got.id === id ? got.b : undefined;
}
