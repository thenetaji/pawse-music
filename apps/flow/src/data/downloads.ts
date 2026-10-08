import {
  bestThumbnail,
  type ResolvedStream,
  type Track,
} from "@studio/music-core";
import { fetch as expoFetch } from "expo/fetch";
import { Directory, File, Paths } from "expo-file-system";
import * as Network from "expo-network";
import { useMemo } from "react";
import { Platform } from "react-native";
import { create, useStore } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

import { resolver, setLocalLookup } from "./clients";
import {
  createDownloadManager,
  type DownloadEntry,
  type DownloadState,
  type IndexState,
  type LiveState,
} from "./downloads-core";
import { onLike, useLibrary } from "./library";
import { kv } from "./storage";

export type { DownloadEntry, DownloadState } from "./downloads-core";

const FAR_FUTURE = Date.UTC(2100, 0, 1);
const native = Platform.OS !== "web";

const index = create<IndexState>()(
  persist(() => ({ entries: {} }), {
    name: "flow.downloads.v1",
    storage: createJSONStorage(() => kv),
    version: 1,
  }),
);
const live = create<LiveState>()(() => ({ progress: {} }));

let dirCache: Directory | undefined;
function dir(): Directory {
  if (!dirCache) {
    dirCache = new Directory(Paths.document, "downloads");
    if (!dirCache.exists) dirCache.create({ intermediates: true });
  }
  return dirCache;
}
const fileAt = (name: string) => new File(dir(), name);
const part = (id: string) => fileAt(`${id}.part`);
const safeDelete = (f: File) => {
  try {
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
};

const manager = createDownloadManager(index, live, {
  resolve: (track) => {
    const quality = useLibrary.getState().settings.downloadQuality;
    return resolver.resolve(track, { quality, remoteOnly: true });
  },
  async fetchRange(url, headers, start, end) {
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
  },
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
  async canDownload() {
    const s = await Network.getNetworkStateAsync();
    if (s.isConnected === false || s.isInternetReachable === false)
      return "offline";
    if (
      useLibrary.getState().settings.wifiOnly &&
      s.type !== Network.NetworkStateType.WIFI &&
      s.type !== Network.NetworkStateType.ETHERNET
    )
      return "wifi";
    return true;
  },
});

/** The downloaded copy as a stream, or undefined; used by the resolver so playback works offline. */
export function localStream(id: string): ResolvedStream | undefined {
  const e = index.getState().entries[id];
  if (!native || e?.state !== "done" || !e.file) return undefined;
  const f = fileAt(e.file);
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

/** file:// uri of the saved artwork, for offline rows. */
export function localArtwork(id: string): string | undefined {
  const art = index.getState().entries[id]?.art;
  return native && art ? fileAt(art).uri : undefined;
}

export const isDownloaded = (id: string) =>
  index.getState().entries[id]?.state === "done";

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

if (native) {
  setLocalLookup(localStream);
  onLike((track, on) => {
    if (on && useLibrary.getState().settings.autoDownloadLiked) download(track);
  });
  // A network change can release downloads held for Wi-Fi or a connection.
  Network.addNetworkStateListener(() => void manager.pump());
  manager.resumeAll();
}
