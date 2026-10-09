import type { ResolvedStream, Track } from "@pawse/music-core";
import type { StoreApi } from "zustand";

export type DownloadState = "queued" | "downloading" | "done" | "error";

export type DownloadEntry = {
  id: string;
  track: Track;
  state: DownloadState;
  addedAt: number;
  /** Final size when done; bytes so far otherwise (last checkpoint). */
  bytes: number;
  total?: number;
  /** File names inside the downloads directory (never absolute: iOS moves the container on update). */
  file?: string;
  art?: string;
  mimeType?: string;
  loudnessDb?: number;
  error?: string;
  /** Queued but held back by the Wi-Fi-only setting or no connection. */
  waiting?: "wifi" | "offline";
};

export type IndexState = { entries: Record<string, DownloadEntry> };
export type LiveState = {
  progress: Record<string, { bytes: number; total?: number }>;
};

export type RangeResult = {
  status: number;
  bytes: Uint8Array;
  /** From Content-Range when present. */
  total?: number;
};

export interface DownloadDeps {
  /** A remote stream (never the local file) at the download quality. */
  resolve(track: Track): Promise<ResolvedStream>;
  fetchRange(
    url: string,
    headers: Record<string, string> | undefined,
    start: number,
    end: number,
  ): Promise<RangeResult>;
  /** Bytes already in the partial file, 0 when there is none. */
  partSize(id: string): number;
  append(id: string, bytes: Uint8Array): void;
  discardPart(id: string): void;
  /** Moves the partial file to its final name and returns that name. */
  finish(id: string, ext: string): string;
  saveArt(id: string, track: Track): Promise<string | undefined>;
  removeFiles(entry: Pick<DownloadEntry, "id" | "file" | "art">): void;
  canDownload(): Promise<true | "wifi" | "offline">;
  sleep?(ms: number): Promise<void>;
}

export const CHUNK = 1 << 20;
const CONCURRENCY = 2;
const MAX_FAILS = 3;
const MAX_REFRESH = 2;

const extOf = (mime: string | undefined) =>
  /webm/i.test(mime ?? "")
    ? "webm"
    : /mpeg|mp3/i.test(mime ?? "")
      ? "mp3"
      : "m4a";
const strip = (t: Track): Track => ({ ...t, setVideoId: undefined });

/** Queue (2 at a time), 1 MiB range chunks, resume from the partial file, re-resolve on 403. */
export function createDownloadManager(
  index: StoreApi<IndexState>,
  live: StoreApi<LiveState>,
  deps: DownloadDeps,
) {
  const active = new Set<string>();
  const cancelled = new Set<string>();
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const entry = (id: string) => index.getState().entries[id];
  const patch = (id: string, p: Partial<DownloadEntry>) =>
    index.setState((s) =>
      s.entries[id]
        ? { entries: { ...s.entries, [id]: { ...s.entries[id], ...p } } }
        : s,
    );
  const setLive = (id: string, bytes: number, total?: number) =>
    live.setState((s) => ({
      progress: { ...s.progress, [id]: { bytes, total } },
    }));
  const clearLive = (id: string) =>
    live.setState((s) => {
      if (!s.progress[id]) return s;
      const { [id]: _gone, ...rest } = s.progress;
      return { progress: rest };
    });

  async function run(id: string): Promise<void> {
    const e = entry(id);
    if (!e) return;
    patch(id, { state: "downloading", error: undefined, waiting: undefined });
    let offset = 0;
    let total: number | undefined;
    try {
      let stream = await deps.resolve(e.track);
      offset = deps.partSize(id);
      total = stream.contentLength ?? e.total;
      // A different format than the one the partial file started with: start over.
      if (
        offset &&
        e.total &&
        stream.contentLength &&
        stream.contentLength !== e.total
      ) {
        deps.discardPart(id);
        offset = 0;
      }
      if (total !== undefined && offset > total) {
        deps.discardPart(id);
        offset = 0;
      }
      patch(id, { total });
      setLive(id, offset, total);
      let fails = 0;
      let refreshes = 0;
      while (total === undefined || offset < total) {
        if (cancelled.has(id)) return;
        const end =
          total === undefined
            ? offset + CHUNK - 1
            : Math.min(offset + CHUNK, total) - 1;
        let r: RangeResult;
        try {
          r = await deps.fetchRange(stream.url, stream.headers, offset, end);
        } catch (err) {
          if (++fails > MAX_FAILS) throw err;
          await sleep(1000 * fails);
          continue;
        }
        if (cancelled.has(id)) return;
        if (r.status === 403 || r.status === 410) {
          if (++refreshes > MAX_REFRESH)
            throw new Error(`media url answered ${r.status}`);
          stream = await deps.resolve(e.track);
          continue;
        }
        if (r.status === 416 && total === undefined && offset > 0) break;
        if (r.status !== 206 && r.status !== 200) {
          if (++fails > MAX_FAILS) throw new Error(`HTTP ${r.status}`);
          await sleep(1000 * fails);
          continue;
        }
        if (r.status === 200) {
          // The server ignored Range and sent the whole file.
          if (offset) deps.discardPart(id);
          deps.append(id, r.bytes);
          offset = total = r.bytes.length;
          break;
        }
        if (r.total !== undefined) total = r.total;
        if (!r.bytes.length) {
          if (total === undefined) break;
          throw new Error("empty range response");
        }
        deps.append(id, r.bytes);
        offset += r.bytes.length;
        fails = 0;
        setLive(id, offset, total);
      }
      if (cancelled.has(id)) return;
      const file = deps.finish(id, extOf(stream.mimeType));
      const art = await deps.saveArt(id, e.track).catch(() => undefined);
      patch(id, {
        state: "done",
        file,
        art,
        bytes: offset,
        total: offset,
        mimeType: stream.mimeType,
        loudnessDb: stream.loudnessDb ?? e.track.loudnessDb,
      });
    } catch (err) {
      if (!cancelled.has(id))
        patch(id, {
          state: "error",
          error: err instanceof Error ? err.message : String(err),
          bytes: offset,
          total,
        });
    } finally {
      clearLive(id);
    }
  }

  let pumping = false;
  let again = false;
  const next = () =>
    Object.values(index.getState().entries)
      .filter((e) => e.state === "queued" && !active.has(e.id))
      .sort((a, b) => a.addedAt - b.addedAt)[0];

  /** Starts queued downloads up to the concurrency limit. */
  async function pump(): Promise<void> {
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    try {
      do {
        again = false;
        while (active.size < CONCURRENCY && next()) {
          const gate = await deps.canDownload();
          const queued = Object.values(index.getState().entries).filter(
            (e) => e.state === "queued",
          );
          if (gate !== true) {
            for (const e of queued)
              if (e.waiting !== gate) patch(e.id, { waiting: gate });
            return;
          }
          for (const e of queued)
            if (e.waiting) patch(e.id, { waiting: undefined });
          const job = next();
          if (!job) break;
          active.add(job.id);
          void run(job.id).finally(() => {
            active.delete(job.id);
            if (cancelled.delete(job.id)) deps.removeFiles(job);
            void pump();
          });
        }
      } while (again);
    } finally {
      pumping = false;
    }
  }

  function enqueue(tracks: Track[]): void {
    const now = Date.now();
    index.setState((s) => {
      const entries = { ...s.entries };
      tracks.forEach((t, i) => {
        const e = entries[t.id];
        if (e && e.state !== "error") return;
        entries[t.id] = {
          id: t.id,
          track: strip(t),
          state: "queued",
          addedAt: e?.addedAt ?? now + i,
          bytes: e?.bytes ?? 0,
          total: e?.total,
        };
      });
      return { entries };
    });
    void pump();
  }

  return {
    pump,
    download: (track: Track) => enqueue([track]),
    downloadMany: (tracks: Track[]) => enqueue(tracks),
    /** Re-queues every failed download. */
    retryFailed: () =>
      enqueue(
        Object.values(index.getState().entries)
          .filter((e) => e.state === "error")
          .map((e) => e.track),
      ),
    remove(id: string): void {
      const e = entry(id);
      if (!e) return;
      index.setState((s) => {
        const { [id]: _gone, ...entries } = s.entries;
        return { entries };
      });
      clearLive(id);
      if (active.has(id)) cancelled.add(id);
      else deps.removeFiles(e);
    },
    /** After a restart: interrupted downloads go back in the queue (their partial files stay). */
    resumeAll(): void {
      for (const e of Object.values(index.getState().entries))
        if (e.state === "downloading") patch(e.id, { state: "queued" });
      void pump();
    },
    isActive: (id: string) => active.has(id),
  };
}

export type DownloadManager = ReturnType<typeof createDownloadManager>;

export type CacheItem = { id: string; bytes: number; at: number };
export type PlayStat = { plays: number; last: number };

const DAY = 86400_000;
const HALF_LIFE_DAYS = 14;

/** Plays per track id from newest-first history. */
export function playStats(
  history: { track: { id: string }; at: number }[],
): Map<string, PlayStat> {
  const out = new Map<string, PlayStat>();
  for (const p of history) {
    const s = out.get(p.track.id);
    if (s) s.plays++;
    else out.set(p.track.id, { plays: 1, last: p.at });
  }
  return out;
}

/** Higher stays longer: 1 + play count, halved every two weeks since the last play (or caching). */
export function cacheScore(
  item: CacheItem,
  stat: PlayStat | undefined,
  now: number,
): number {
  const last = Math.max(item.at, stat?.last ?? 0);
  const ageDays = Math.max(0, now - last) / DAY;
  return (1 + (stat?.plays ?? 0)) * 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

/** Ids to delete, lowest score first, until the cache fits in `limit` bytes. */
export function pickEvictions(
  items: CacheItem[],
  stats: Map<string, PlayStat>,
  limit: number,
  now: number,
): string[] {
  let total = items.reduce((sum, i) => sum + i.bytes, 0);
  if (total <= limit) return [];
  const scored = items
    .map((i) => ({ i, score: cacheScore(i, stats.get(i.id), now) }))
    .sort((a, b) => a.score - b.score || a.i.at - b.i.at);
  const out: string[] = [];
  for (const { i } of scored) {
    if (total <= limit) break;
    out.push(i.id);
    total -= i.bytes;
  }
  return out;
}
