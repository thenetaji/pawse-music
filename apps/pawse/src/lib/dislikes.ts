import { useEffect, useState } from "react";

import { appFetch } from "./net";
import { useSetting } from "./settings";

// Return YouTube Dislike (returnyoutubedislike.com): YouTube's like count and an estimate of the hidden dislikes.
const API = "https://returnyoutubedislikeapi.com/votes?videoId=";

export type Votes = { likes: number; dislikes: number };
const cache = new Map<string, Promise<Votes | null>>();

function votes(id: string): Promise<Votes | null> {
  let p = cache.get(id);
  if (!p) {
    p = appFetch(API + encodeURIComponent(id), { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d && typeof d.likes === "number" && typeof d.dislikes === "number"
          ? { likes: d.likes, dislikes: d.dislikes }
          : null,
      )
      .catch(() => {
        cache.delete(id);
        return null;
      });
    cache.set(id, p);
  }
  return p;
}

/** The video's likes and estimated dislikes, when "Show dislikes" is on. */
export function useVotes(id: string): Votes | null {
  const on = useSetting("showDislikes", true);
  const [got, setGot] = useState<{ id: string; v: Votes | null }>();
  useEffect(() => {
    if (!on) return;
    let live = true;
    void votes(id).then((v) => live && setGot({ id, v }));
    return () => {
      live = false;
    };
  }, [id, on]);
  return on && got?.id === id ? got.v : null;
}

/** 19,492,749 → 19M; 521,581 → 522K. */
export function compact(n: number): string {
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [v, u] of units)
    if (n >= v) {
      const x = n / v;
      return `${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}${u}`;
    }
  return String(n);
}
