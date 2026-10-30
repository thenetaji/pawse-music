import {
  LastFm,
  type Listen,
  ListenBrainz,
  type ScrobbleResult,
  scrobbleAfterSec,
} from "@pawse/innertube";
import type { Track } from "@pawse/music-core";
import { getProgress, onPlayerEvent, usePlayerStore } from "@pawse/player";
import * as Crypto from "expo-crypto";
import { AppState } from "react-native";
import { create } from "zustand";

import { appVersion } from "../lib/app-version";
import { appFetch, networkStore } from "../lib/net";
import { getSetting } from "../lib/settings";
import { kv } from "./storage";
import { vaultGet, vaultSet } from "./vault";

type Service = "lastfm" | "listenbrainz";
type Queued = Listen & { artists: string[] };

const QUEUE_KEY = "pawse.scrobbles.v1";
const QUEUE_MAX = 500;
const RETRY_MS = [30_000, 120_000, 600_000];
const TICK_MS = 5_000;

const md5 = (text: string) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, text);

type Accounts = { lastfm?: string; listenbrainz?: string; waiting: number };
export const useScrobbleAccounts = create<Accounts>(() => ({
  lastfm: vaultGet("lastfm.user") ?? undefined,
  listenbrainz: vaultGet("lb.user") ?? undefined,
  waiting: 0,
}));

const lastFm = () => {
  const apiKey = vaultGet("lastfm.key");
  const secret = vaultGet("lastfm.secret");
  const sessionKey = vaultGet("lastfm.session");
  return apiKey && secret && sessionKey
    ? new LastFm({ fetch: appFetch, apiKey, secret, sessionKey, md5 })
    : undefined;
};

const listenBrainz = () => {
  const token = vaultGet("lb.token");
  return token
    ? new ListenBrainz({
        fetch: appFetch,
        token,
        client: { name: "Pawse", version: appVersion },
      })
    : undefined;
};

export function lastFmSetup(apiKey: string, secret: string) {
  return new LastFm({ fetch: appFetch, apiKey, secret, md5 });
}

export const checkListenBrainz = (token: string) =>
  new ListenBrainz({
    fetch: appFetch,
    token,
    client: { name: "Pawse", version: appVersion },
  })
    .validate()
    .catch(() => undefined);

export function saveLastFm(
  apiKey: string,
  secret: string,
  session: { key: string; name: string },
) {
  vaultSet("lastfm.key", apiKey);
  vaultSet("lastfm.secret", secret);
  vaultSet("lastfm.session", session.key);
  vaultSet("lastfm.user", session.name);
  useScrobbleAccounts.setState({ lastfm: session.name });
}

export function saveListenBrainz(token: string, user: string) {
  vaultSet("lb.token", token);
  vaultSet("lb.user", user);
  useScrobbleAccounts.setState({ listenbrainz: user });
}

export function signOutScrobbler(service: Service) {
  const keys =
    service === "lastfm"
      ? ["lastfm.key", "lastfm.secret", "lastfm.session", "lastfm.user"]
      : ["lb.token", "lb.user"];
  keys.forEach((k) => vaultSet(k, null));
  useScrobbleAccounts.setState(
    service === "lastfm" ? { lastfm: undefined } : { listenbrainz: undefined },
  );
  queues[service] = [];
  persist();
}

const queues: Record<Service, Queued[]> = { lastfm: [], listenbrainz: [] };

function persist() {
  useScrobbleAccounts.setState({
    waiting: queues.lastfm.length + queues.listenbrainz.length,
  });
  void kv.set(QUEUE_KEY, JSON.stringify(queues)).catch(() => {});
}

async function load() {
  try {
    const saved = JSON.parse((await kv.get(QUEUE_KEY)) ?? "{}");
    for (const s of ["lastfm", "listenbrainz"] as const)
      if (Array.isArray(saved[s])) queues[s].unshift(...saved[s]);
    persist();
  } catch {}
}

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let attempt = 0;
let flushing = false;

async function sendBatch(service: Service): Promise<ScrobbleResult> {
  const batch = queues[service].slice(0, 50);
  if (!batch.length) return "ok";
  const asListens = batch.map((q) => ({
    ...q,
    artist: service === "lastfm" ? q.artists[0] : q.artists.join(", "),
  }));
  const client = service === "lastfm" ? lastFm() : listenBrainz();
  if (!client) return "signed-out";
  const result = await client.scrobble(asListens);
  if (result !== "retry") queues[service].splice(0, batch.length);
  return result;
}

export async function flushScrobbles() {
  if (flushing) return;
  flushing = true;
  clearTimeout(retryTimer);
  let again = false;
  try {
    for (const service of ["lastfm", "listenbrainz"] as const) {
      while (queues[service].length) {
        const result = await sendBatch(service);
        if (result === "retry") {
          again = true;
          break;
        }
        if (result === "signed-out") {
          queues[service] = [];
          break;
        }
      }
    }
  } finally {
    flushing = false;
    persist();
  }
  if (again) {
    retryTimer = setTimeout(
      () => void flushScrobbles(),
      RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)],
    );
  } else attempt = 0;
}

const enqueue = (item: Queued) => {
  for (const s of ["lastfm", "listenbrainz"] as const) {
    if (!useScrobbleAccounts.getState()[s]) continue;
    queues[s].push(item);
    if (queues[s].length > QUEUE_MAX) queues[s].shift();
  }
  persist();
  void flushScrobbles();
};

const off = () =>
  getSetting("incognito", false) || getSetting("pauseHistory", false);

const isSong = (t: Track) =>
  (t.kind !== "video" || !!t.official) && !!t.artists[0]?.name;

type Current = {
  key: string;
  track: Track;
  startedAt: number;
  listenedMs: number;
  playingSince: number;
  announced: boolean;
  sent: boolean;
  finished: boolean;
  duration?: number;
};

async function announce(c: Current) {
  const artists = c.track.artists.map((a) => a.name);
  const base = {
    title: c.track.title,
    album: c.track.album?.title,
    durationSec: c.track.durationSec,
  };
  await Promise.all([
    lastFm()?.nowPlaying({ ...base, artist: artists[0] }),
    listenBrainz()?.nowPlaying({ ...base, artist: artists.join(", ") }),
  ]).catch(() => {});
}

let stop: (() => void) | undefined;

export function startScrobbler(): () => void {
  if (stop) return stop;
  let cur: Current | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  void load().then(() => flushScrobbles());

  const listened = (c: Current) =>
    c.listenedMs + (c.playingSince ? Date.now() - c.playingSince : 0);

  const tick = () => {
    const d = getProgress().duration;
    if (cur && d > 0) cur.duration = d;
    check();
  };

  const check = () => {
    if (!cur || cur.sent || off()) return;
    const dur = cur.duration || cur.track.durationSec || 0;
    const need = dur ? scrobbleAfterSec(dur) : undefined;
    if (need === undefined || listened(cur) < need * 1000) return;
    cur.sent = true;
    enqueue({
      artist: cur.track.artists[0].name,
      artists: cur.track.artists.map((a) => a.name),
      title: cur.track.title,
      album: cur.track.album?.title,
      durationSec: dur,
      startedAt: cur.startedAt,
    });
  };

  const sync = (s: ReturnType<typeof usePlayerStore.getState>) => {
    const key = s.keys[s.index];
    const track = s.tracks[s.index];
    if (cur && (cur.key !== key || s.status === "idle")) {
      if (cur.playingSince) {
        cur.listenedMs += Date.now() - cur.playingSince;
        cur.playingSince = 0;
      }
      check();
      cur = undefined;
    }
    if (!cur && key && track && s.status !== "idle" && isSong(track))
      cur = {
        key,
        track,
        startedAt: 0,
        listenedMs: 0,
        playingSince: 0,
        announced: false,
        sent: false,
        finished: false,
      };
    if (!cur) return;
    if (s.status === "playing") {
      if (!cur.playingSince) cur.playingSince = Date.now();
      if (!cur.startedAt) cur.startedAt = Math.floor(Date.now() / 1000);
      const d = getProgress().duration;
      if (d > 0) cur.duration = d;
      if (!cur.announced && !off()) {
        cur.announced = true;
        void announce(cur);
      }
    } else if (cur.playingSince) {
      cur.listenedMs += Date.now() - cur.playingSince;
      cur.playingSince = 0;
    }
    clearInterval(ticker);
    ticker = s.status === "playing" ? setInterval(tick, TICK_MS) : undefined;
  };

  sync(usePlayerStore.getState());
  const unsubStore = usePlayerStore.subscribe((s, prev) => {
    if (
      s.status !== prev.status ||
      s.index !== prev.index ||
      s.keys !== prev.keys
    )
      sync(s);
  });
  const unsubFinished = onPlayerEvent("finished", (t) => {
    if (cur && t?.id === cur.track.id) {
      tick();
      cur.finished = true;
    }
  });
  // Repeat-one restarts without a track change; each loop is its own listen.
  const unsubRepeat = onPlayerEvent("seeked", (t) => {
    if (!cur?.finished || t?.id !== cur.track.id) return;
    const playing = !!cur.playingSince;
    cur = {
      ...cur,
      startedAt: playing ? Math.floor(Date.now() / 1000) : 0,
      listenedMs: 0,
      playingSince: playing ? Date.now() : 0,
      announced: false,
      sent: false,
      finished: false,
    };
    sync(usePlayerStore.getState());
  });
  const app = AppState.addEventListener("change", (st) => {
    if (st === "active") void flushScrobbles();
  });
  const net = networkStore.subscribe((s, prev) => {
    if (prev.kind === "offline" && s.kind !== "offline") void flushScrobbles();
  });

  stop = () => {
    clearInterval(ticker);
    clearTimeout(retryTimer);
    unsubStore();
    unsubFinished();
    unsubRepeat();
    app.remove();
    net();
    stop = undefined;
  };
  return stop;
}
