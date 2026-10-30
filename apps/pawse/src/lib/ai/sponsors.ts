import type { CaptionCue } from "@pawse/music-core";

import { chunkCues, groupCues, stamped } from "./chunks";
import { type Respond, secOf } from "./chapters";

export type SponsorSpot = { start: number; end: number };

const HINTS = [
  /\bsponsor(?:ed|ing|s|ship)?\b/i,
  /\bbrought to you by\b/i,
  /\b(?:promo|discount|coupon|referral|affiliate) code\b/i,
  /\buse (?:my )?code\b/i,
  /\blink (?:is )?(?:down )?(?:in|below in) the (?:description|bio)\b/i,
  /\b\d{1,2}% off\b/i,
  /\bfree trial\b/i,
  /\bour (?:friends|partners) at\b/i,
  /\bpartner(?:ed|ing)? with\b/i,
];
const CLUSTER_SEC = 90;
const BEFORE_SEC = 30;
const AFTER_SEC = 45;
const MAX_CANDIDATES = 3;
const MIN_SEC = 10;
const MAX_SEC = 240;

export const SPONSOR_CONTEXT =
  `You find paid sponsor reads in video transcripts. Each line starts with a [m:ss] timestamp. ` +
  `Reply with only JSON: {"sponsor":true,"start":"m:ss","end":"m:ss"} where start is where the advertisement begins ` +
  `and end is where the video's own content resumes, or {"sponsor":false} when the creator is not reading a paid ad. ` +
  `The creator's own channel, merch and other videos are not sponsors.`;

export function sponsorCandidates(cues: CaptionCue[]): SponsorSpot[] {
  const hits = cues.filter((c) => HINTS.some((re) => re.test(c.text)));
  const clusters: CaptionCue[][] = [];
  for (const hit of hits) {
    const last = clusters.at(-1);
    if (last && hit.start - last[last.length - 1].end <= CLUSTER_SEC)
      last.push(hit);
    else clusters.push([hit]);
  }
  return clusters
    .filter((c) => c.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({
      start: Math.max(0, c[0].start - BEFORE_SEC),
      end: c[c.length - 1].end + AFTER_SEC,
    }))
    .sort((a, b) => a.start - b.start);
}

export function parseSponsor(
  reply: string,
  from: number,
  to: number,
): SponsorSpot | null {
  const a = reply.indexOf("{");
  const b = reply.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let raw: { sponsor?: unknown; start?: unknown; end?: unknown };
  try {
    raw = JSON.parse(reply.slice(a, b + 1));
  } catch {
    return null;
  }
  const start = secOf(raw.start);
  const end = secOf(raw.end);
  if (raw.sponsor !== true || start === undefined || end === undefined)
    return null;
  if (end - start < MIN_SEC || end - start > MAX_SEC) return null;
  if (start < from - 5 || end > to + 5) return null;
  return { start, end };
}

export async function findSponsors(
  cues: CaptionCue[],
  respond: Respond,
): Promise<SponsorSpot[]> {
  const spots: SponsorSpot[] = [];
  for (const window of sponsorCandidates(cues)) {
    const inside = cues.filter(
      (c) => c.end > window.start && c.start < window.end,
    );
    const text = chunkCues(groupCues(inside, 8), 1500, stamped)[0]?.text;
    if (!text) continue;
    const reply = await respond(text, SPONSOR_CONTEXT);
    const spot = reply ? parseSponsor(reply, window.start, window.end) : null;
    if (spot) spots.push(spot);
  }
  return spots;
}
