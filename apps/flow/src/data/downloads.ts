import {
  bestThumbnail,
  type ResolvedStream,
  type Track,
} from "@studio/music-core";
import { onPlayerEvent, setPrefetchAhead } from "@studio/player";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import * as Network from "expo-network";
import { useMemo } from "react";
import { Platform } from "react-native";
import { create, useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import {
  type NetworkKind,
  networkKind,
  networkStore,
  refreshNetworkKind,
} from "../lib/net";
import { resolver, setLocalLookup } from "./clients";
import {
  createDownloadManager,
  type DownloadDeps,
  type DownloadEntry,
  type DownloadState,
  type IndexState,
  type LiveState,
  pickEvictions,
  playStats,
} from "./downloads-core";
import { onLike, useLibrary } from "./library";
import { kv } from "./storage";

export type { DownloadEntry, DownloadState } from "./downloads-core";

const FAR_FUTURE = Date.UTC(2100, 0, 1);
const native = Platform.OS !== "web";

const settings = () => useLibrary.getState().settings;

const index = create<IndexState>()(
  persist(() => ({ entries: {} }), {
    name: "flow.downloads.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);
const live = create<LiveState>()(() => ({ progress: {} }));
// Played songs kept for offline play: same manager, own index and folder, never mixed with user downloads.
const cacheIndex = create<IndexState>()(
  persist(() => ({ entries: {} }), {
    name: "flow.cache.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);
const cacheLive = create<LiveState>()(() => ({ progress: {} }));

function lazyDir(name: string): () => Directory {
  let d: Directory | undefined;
  return () => {
    if (!d) {
      d = new Directory(Paths.document, name);
      if (!d.exists) d.create({ intermediates: true });
    }
    return d;
  };
}
const downloadsDir = lazyDir("downloads");
const cacheDir = lazyDir("song-cache");
const safeDelete = (f: File) => {
  try {
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
};

async function fetchRange(
  url: string,
  headers: Record<string, string> | undefined,
  start: number,
  end: number,
) {
  const res = await expoFetch(url, {
    headers: { ...headers, Range: `bytes=${start}-${end}` },
  });
  const total = Number(
    res.headers.get("content-range")?.match(/\/(\d+)\s*$/)?.[1],
  );
  const bytes =
    res.status === 200 || res.status === 206
      ? new Uint8Array(await res.arrayBuffer())
      : new Uint8Array(0);
  return { status: res.status, bytes, total: total > 0 ? total : undefined };
}

type FileDeps = Omit<DownloadDeps, "resolve" | "canDownload">;
function fileDeps(dir: () => Directory): FileDeps {
  const fileAt = (name: string) => new File(dir(), name);
  const part = (id: string) => fileAt(`${id}.part`);
  return {
    fetchRange,
    partSize: (id) => {
      const f = part(id);
      return f.exists ? f.size : 0;
    },
    append(id, bytes) {
      const f = part(id);
      if (!f.exists) f.create();
      f.write(bytes, { append: true });
    },
    discardPart: (id) => safeDelete(part(id)),
    finish(id, ext) {
      const name = `${id}.${ext}`;
      safeDelete(fileAt(name));
      part(id).moveSync(fileAt(name));
      return name;
    },
    async saveArt(id, track) {
      const url = bestThumbnail(track.thumbnails, 544);
      if (!url) return undefined;
      const name = `${id}.jpg`;
      safeDelete(fileAt(name));
      await File.downloadFileAsync(url, fileAt(name), { idempotent: true });
      return name;
    },
    removeFiles(e) {
      safeDelete(part(e.id));
      if (e.file) safeDelete(fileAt(e.file));
      if (e.art) safeDelete(fileAt(e.art));
    },
  };
}

const manager = createDownloadManager(index, live, {
  ...fileDeps(downloadsDir),
  resolve: (track) =>
    resolver.resolve(track, {
      quality: settings().downloadQuality,
      remoteOnly: true,
    }),
  async canDownload() {
    const s = await Network.getNetworkStateAsync();
    if (s.isConnected === false || s.isInternetReachable === false)
      return "offline";
    if (
      settings().wifiOnly &&
      s.type !== Network.NetworkStateType.WIFI &&
      s.type !== Network.NetworkStateType.ETHERNET
    )
      return "wifi";
    return true;
  },
});

/** Data saver or Wi-Fi only keeps caching off mobile data. */
const cacheBlockedOn = (kind: NetworkKind) =>
  kind === "cellular" && (settings().dataSaver || settings().wifiOnly);

const cacheManager = createDownloadManager(cacheIndex, cacheLive, {
  ...fileDeps(cacheDir),
  // Streaming quality for the current network.
  resolve: (track) => resolver.resolve(track, { remoteOnly: true }),
  async canDownload() {
    const kind = await refreshNetworkKind().catch(networkKind);
    if (kind === "offline") return "offline";
    return cacheBlockedOn(kind) ? "wifi" : true;
  },
});

function stream(
  store: typeof index,
  dir: () => Directory,
  id: string,
): ResolvedStream | undefined {
  const e = store.getState().entries[id];
  if (e?.state !== "done" || !e.file) return undefined;
  const f = new File(dir(), e.file);
  if (!f.exists) return undefined;
  return {
    url: f.uri,
    mimeType: e.mimeType ?? "audio/mp4",
    bitrate: 0,
    contentLength: e.bytes || undefined,
    expiresAt: FAR_FUTURE,
    loudnessDb: e.loudnessDb,
    via: "local",
  };
}

/** The downloaded (or cached) copy as a stream, or undefined; used by the resolver so playback works offline. */
export function localStream(id: string): ResolvedStream | undefined {
  if (!native) return undefined;
  return stream(index, downloadsDir, id) ?? stream(cacheIndex, cacheDir, id);
}

/** file:// uri of the saved artwork, for offline rows. */
export function localArtwork(id: string): string | undefined {
  if (!native) return undefined;
  const d = index.getState().entries[id]?.art;
  if (d) return new File(downloadsDir(), d).uri;
  const c = cacheIndex.getState().entries[id]?.art;
  return c ? new File(cacheDir(), c).uri : undefined;
}

export const isDownloaded = (id: string) =>
  index.getState().entries[id]?.state === "done";
const isCached = (id: string) =>
  cacheIndex.getState().entries[id]?.state === "done";
/** Downloaded or cached: plays without a connection. */
export const isAvailableOffline = (id: string) =>
  isDownloaded(id) || isCached(id);

export function download(track: Track): void {
  if (native && track.source !== "local") manager.download(track);
}
export function downloadMany(tracks: Track[]): void {
  if (native) manager.downloadMany(tracks.filter((t) => t.source !== "local"));
}
export const removeDownload = (id: string) => manager.remove(id);
export function removeAllDownloads(): void {
  for (const id of Object.keys(index.getState().entries)) manager.remove(id);
}
export const retryDownloads = () => manager.retryFailed();

/** Bytes on disk for downloads (finished plus in progress). */
export function storageUsed(): number {
  const progress = live.getState().progress;
  return Object.values(index.getState().entries).reduce(
    (sum, e) => sum + (progress[e.id]?.bytes ?? e.bytes),
    0,
  );
}

/** One track's state and 0–1 progress; state is undefined when it is not downloaded. */
export function useDownload(id: string): {
  state: DownloadState | undefined;
  progress: number;
} {
  const state = useStore(index, (s) => s.entries[id]?.state);
  const p = useStore(
    live,
    useShallow((s) => s.progress[id] ?? { bytes: 0, total: undefined }),
  );
  const progress =
    state === "done" ? 1 : p.total ? Math.min(1, p.bytes / p.total) : 0;
  return { state, progress };
}

export type DownloadRow = DownloadEntry & { progress: number };

function summarize(
  entries: IndexState["entries"],
  progress: LiveState["progress"],
) {
  let totalBytes = 0;
  let active = 0;
  const list: DownloadRow[] = [];
  for (const e of Object.values(entries)) {
    const p = progress[e.id];
    const bytes = p?.bytes ?? e.bytes;
    const total = p?.total ?? e.total;
    totalBytes += bytes;
    if (e.state === "downloading" || e.state === "queued") active++;
    list.push({
      ...e,
      bytes,
      progress: e.state === "done" ? 1 : total ? Math.min(1, bytes / total) : 0,
    });
  }
  list.sort((a, b) => b.addedAt - a.addedAt);
  return { list, totalBytes, active };
}

/** Every download, newest first, with live progress, total bytes and how many are still running. */
export function useDownloads(): {
  list: DownloadRow[];
  totalBytes: number;
  active: number;
} {
  const entries = useStore(index, (s) => s.entries);
  const progress = useStore(live, (s) => s.progress);
  return useMemo(() => summarize(entries, progress), [entries, progress]);
}

/** True unless the device reports no connection. */
export function useOnline(): boolean {
  const s = Network.useNetworkState();
  return s.isInternetReachable ?? s.isConnected ?? true;
}

/** Current connection type, kept fresh by a listener. */
export const useNetworkKind = (): NetworkKind =>
  useStore(networkStore, (s) => s.kind);

/** Data saver on and the phone is on mobile data. */
export const isDataSaverActive = () =>
  settings().dataSaver && networkKind() === "cellular";
export function useDataSaverActive(): boolean {
  const on = useLibrary((s) => s.settings.dataSaver);
  const kind = useNetworkKind();
  return on && kind === "cellular";
}

export type CachedRow = { track: Track; bytes: number; at: number };
function summarizeCache(entries: IndexState["entries"]) {
  let bytes = 0;
  const list: CachedRow[] = [];
  for (const e of Object.values(entries)) {
    if (e.state !== "done") continue;
    bytes += e.bytes;
    list.push({ track: e.track, bytes: e.bytes, at: e.addedAt });
  }
  list.sort((a, b) => b.at - a.at);
  return { list, bytes };
}

/** Songs kept by auto cache, newest first, and their total size. */
export function useCached(): { list: CachedRow[]; bytes: number } {
  const entries = useStore(cacheIndex, (s) => s.entries);
  return useMemo(() => summarizeCache(entries), [entries]);
}

export function clearCache(): void {
  for (const id of Object.keys(cacheIndex.getState().entries))
    cacheManager.remove(id);
}

/** Downloaded and cached songs, newest first, each once. */
export function useOfflineTracks(): Track[] {
  const downloads = useStore(index, (s) => s.entries);
  const cached = useStore(cacheIndex, (s) => s.entries);
  return useMemo(() => {
    const seen = new Set<string>();
    return [...Object.values(downloads), ...Object.values(cached)]
      .filter((e) => e.state === "done")
      .sort((a, b) => b.addedAt - a.addedAt)
      .filter((e) => !seen.has(e.id) && seen.add(e.id))
      .map((e) => e.track);
  }, [downloads, cached]);
}

/** Keeps a song the user just finished, if auto cache and the network allow it. */
function maybeCache(track?: Track): void {
  const s = settings();
  if (!track || track.source === "local" || !s.autoCache) return;
  if (s.cacheLimitMb <= 0) return;
  const id = track.id;
  if (index.getState().entries[id] || cacheIndex.getState().entries[id]) return;
  const kind = networkKind();
  if (kind === "offline" || cacheBlockedOn(kind)) return;
  cacheManager.download(track);
}

/** Deletes the lowest scored cached songs until the cache fits its limit. */
function evictCache(): void {
  const items = Object.values(cacheIndex.getState().entries)
    .filter((e) => e.state === "done")
    .map((e) => ({ id: e.id, bytes: e.bytes, at: e.addedAt }));
  const limit = Math.max(0, settings().cacheLimitMb) * 1024 * 1024;
  const stats = playStats(useLibrary.getState().history);
  for (const id of pickEvictions(items, stats, limit, Date.now()))
    cacheManager.remove(id);
}

const applyPrefetch = () =>
  setPrefetchAhead(isDataSaverActive() ? 1 : undefined);

if (native) {
  setLocalLookup(localStream);
  onLike((track, on) => {
    if (on && settings().autoDownloadLiked) download(track);
  });
  onPlayerEvent("finished", maybeCache);
  // A cache job that failed is dropped; a finished one may push the cache over its limit.
  cacheIndex.subscribe((s, prev) => {
    let done = false;
    for (const e of Object.values(s.entries)) {
      if (e.state === "error") queueMicrotask(() => cacheManager.remove(e.id));
      else if (e.state === "done" && prev.entries[e.id]?.state !== "done")
        done = true;
    }
    if (done) queueMicrotask(evictCache);
  });
  // A song the user downloads no longer needs its cached copy.
  index.subscribe((s, prev) => {
    for (const e of Object.values(s.entries))
      if (
        e.state === "done" &&
        prev.entries[e.id]?.state !== "done" &&
        cacheIndex.getState().entries[e.id]
      )
        queueMicrotask(() => cacheManager.remove(e.id));
  });
  useLibrary.subscribe((s, prev) => {
    if (s.settings.cacheLimitMb !== prev.settings.cacheLimitMb) evictCache();
    if (s.settings.dataSaver !== prev.settings.dataSaver) applyPrefetch();
  });
  networkStore.subscribe(applyPrefetch);
  applyPrefetch();
  // Cached files the OS or a reinstall removed leave the index.
  for (const e of Object.values(cacheIndex.getState().entries))
    if (e.state === "done" && !stream(cacheIndex, cacheDir, e.id))
      cacheManager.remove(e.id);
  // A network change can release downloads held for Wi-Fi or a connection.
  Network.addNetworkStateListener(() => {
    void manager.pump();
    void cacheManager.pump();
  });
  manager.resumeAll();
  cacheManager.resumeAll();
}
