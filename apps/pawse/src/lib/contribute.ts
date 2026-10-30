import {
  Contribute,
  RydVotes,
  type SegmentCategory,
  sha1Hex,
  type Submitted,
} from "@pawse/innertube";
import * as Crypto from "expo-crypto";

import { showToast } from "../components/toast";
import { onDislike, onLike } from "../data/library";
import { vaultGet, vaultSet } from "../data/vault";
import { appVersion } from "./app-version";
import { getSetting } from "./settings";
import { appFetch } from "./net";

// One random id per install; each service gets its own id derived from it, so SponsorBlock's private id
// is never shared with another service.
const UA = `Pawse/${appVersion}`;
const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function install(): string {
  let id = vaultGet("install");
  if (!id) {
    id = Array.from(Crypto.getRandomBytes(32), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    vaultSet("install", id);
  }
  return id;
}

export function alnumFrom(seed: string, length: number): string {
  const hex = sha1Hex(`a:${seed}`) + sha1Hex(`b:${seed}`);
  let out = "";
  for (let i = 0; out.length < length; i++)
    out +=
      ALNUM[Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16) % ALNUM.length];
  return out;
}

const randomId = (length: number) =>
  Array.from(
    Crypto.getRandomBytes(length),
    (b) => ALNUM[b % ALNUM.length],
  ).join("");

export const contributing = () =>
  getSetting("contribute", true) && !getSetting("incognito", false);

let sb: Contribute | undefined;
const community = () =>
  (sb ??= new Contribute({
    fetch: appFetch,
    userId: sha1Hex(`sponsorblock:${install()}`),
    userAgent: UA,
  }));

let ryd: RydVotes | undefined;
const dislikes = () =>
  (ryd ??= new RydVotes({
    fetch: appFetch,
    identity: () => ({
      userId: vaultGet("ryd.id") ?? alnumFrom(`ryd:${install()}`, 36),
      registered: vaultGet("ryd.ok") === "1",
    }),
    save: (v) => {
      vaultSet("ryd.id", v.userId);
      vaultSet("ryd.ok", v.registered ? "1" : "0");
    },
    newUserId: () => randomId(36),
  }));

export function shareRating(
  videoId: string,
  rating: "like" | "dislike" | "none",
) {
  if (!contributing()) return;
  const value = rating === "like" ? 1 : rating === "dislike" ? -1 : 0;
  void dislikes()
    .vote(videoId, value)
    .catch(() => {});
}

export function startSharingRatings(): () => void {
  const stops = [
    onLike((t, on) => {
      if (t.source === "youtube") shareRating(t.id, on ? "like" : "none");
    }),
    onDislike((t, on) => {
      if (t.source === "youtube") shareRating(t.id, on ? "dislike" : "none");
    }),
  ];
  return () => stops.forEach((stop) => stop());
}

const said: Record<Submitted, string> = {
  ok: "Sent. Thank you!",
  duplicate: "Already there. Thank you!",
  "slow-down": "Too many at once. Try again in a bit.",
  rejected: "SponsorBlock didn’t take that.",
};
const tell = (r: Submitted) =>
  showToast(said[r], { bad: r === "rejected" || r === "slow-down" });
const failed = () =>
  showToast("Couldn’t reach SponsorBlock. Try again later.", { bad: true });

export function sendSegment(s: {
  videoId: string;
  start: number;
  end: number;
  category: SegmentCategory;
  duration?: number;
}) {
  if (!contributing()) return;
  community().submitSegment(s).then(tell, failed);
}

export function voteSegment(
  segment: { uuid: string; videoId: string },
  up: boolean,
) {
  if (!contributing()) return;
  community()
    .vote(segment, up ? "up" : "down")
    .then(
      () => showToast(up ? "Glad that helped" : "Thanks, noted"),
      () => {},
    );
}

export function sendTitle(videoId: string, title: string) {
  if (!contributing()) return;
  community().suggestTitle(videoId, title).then(tell, failed);
}

export function sendThumbnail(videoId: string, timestamp: number) {
  if (!contributing()) return;
  community().suggestThumbnail(videoId, timestamp).then(tell, failed);
}

export function voteTitle(videoId: string, title: string, up: boolean) {
  if (!contributing()) return;
  community()
    .voteTitle(videoId, title, up)
    .then(
      () => showToast(up ? "Voted for this title" : "Voted against this title"),
      failed,
    );
}

export function voteThumbnail(videoId: string, timestamp: number, up: boolean) {
  if (!contributing()) return;
  community()
    .voteThumbnail(videoId, timestamp, up)
    .then(
      () =>
        showToast(
          up ? "Voted for this thumbnail" : "Voted against this thumbnail",
        ),
      failed,
    );
}
