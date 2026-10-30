import type { CatalogItem, Track } from "@pawse/music-core";

import { currentFilters, trackVector } from "../../data/mood-library";
import { eraOf, isAllowed, MIN_CONFIDENCE } from "../../data/moods";
import { trackKey } from "../../data/recommend";
import { yt } from "../engine";
import { playSmooth } from "../smooth-queue";
import { DJ_CONTEXT, type DjPlan, parseDjPlan } from "./dj-plan";
import { respond } from "./model";

const MIX_SIZE = 40;
const MAX_MISS = 0.35;
// A song with nothing known about it was found by the plan's search terms, so it stays in.
const UNKNOWN_MISS = 0.2;

type Target = { era?: number; energy?: number };

export async function planMix(request: string): Promise<DjPlan> {
  return parseDjPlan(await respond(request, DJ_CONTEXT), request);
}

function targetOf(plan: DjPlan): Target {
  const year =
    plan.yearFrom && plan.yearTo
      ? (plan.yearFrom + plan.yearTo) / 2
      : (plan.yearFrom ?? plan.yearTo);
  return {
    era: year === undefined ? undefined : eraOf(year),
    energy: plan.energy,
  };
}

function missOf(track: Track, target: Target): number {
  const v = trackVector(track);
  if (v.confidence < MIN_CONFIDENCE) return UNKNOWN_MISS;
  return Math.hypot(
    target.era === undefined ? 0 : v.era - target.era,
    target.energy === undefined ? 0 : v.energy - target.energy,
  );
}

const isTrack = (item: CatalogItem): item is CatalogItem & { type: "track" } =>
  item.type === "track";

export async function buildMix(plan: DjPlan): Promise<Track[]> {
  const found = await Promise.all(
    plan.terms.map((term) =>
      yt.search(term, "songs").then(
        (r) => (r.items ?? []).filter(isTrack) as Track[],
        () => [] as Track[],
      ),
    ),
  );
  const filters = currentFilters();
  const target = targetOf(plan);
  const seen = new Set<string>();
  return found
    .flat()
    .filter((t) => {
      const key = trackKey(t);
      if (seen.has(key)) return false;
      seen.add(key);
      return isAllowed(t, filters);
    })
    .map((track) => ({
      track,
      miss: missOf(track, target) + Math.random() * 0.05,
    }))
    .filter((x) => x.miss <= MAX_MISS)
    .sort((a, b) => a.miss - b.miss)
    .slice(0, MIX_SIZE)
    .map((x) => x.track);
}

export async function playMix(plan: DjPlan): Promise<boolean> {
  const tracks = await buildMix(plan);
  if (tracks.length < 3) return false;
  await playSmooth(tracks, { source: { type: "other", title: plan.title } });
  return true;
}
