import { repackageOpus } from "@pawse/innertube";
import type { ResolvedStream, ResolveOptions, Track } from "@pawse/music-core";
import { Directory, File, Paths } from "expo-file-system";

import { fetchRange } from "../data/downloads";
import { remuxContainer, remuxOpusOn } from "./audio-format";
import { logEvent } from "./diagnostics";

export const REMUX_VIA = "remux:opus";

const FAR_FUTURE = Date.UTC(2100, 0, 1);
// Under googlevideo's 10 MiB limit, and a few requests for a song.
const CHUNK = 4 << 20;
const MAX_BYTES = 20 << 20;
// Repackaged files are working copies in the system's cache folder: no index, nothing kept across launches.
const KEEP_FILES = 24;

let dir: Directory | undefined;
const kept: File[] = [];

function folder(): Directory {
  if (!dir) {
    dir = new Directory(Paths.cache, "opus-remux");
    if (dir.exists) {
      for (const f of dir.list()) safeDelete(f);
    } else dir.create({ intermediates: true });
  }
  return dir;
}

function safeDelete(f: File | Directory) {
  try {
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

async function download(src: NonNullable<ResolvedStream["opus"]>) {
  const parts: Uint8Array[] = [];
  let size = src.contentLength;
  let offset = 0;
  for (;;) {
    const end = Math.min(offset + CHUNK, size ?? Number.POSITIVE_INFINITY) - 1;
    const want = end - offset + 1;
    const r = await fetchRange(src.url, src.headers, offset, end);
    if (r.status === 416 && offset > 0) break;
    if (r.status !== 200 && r.status !== 206)
      throw new Error(`Opus download answered ${r.status}`);
    // A server that ignores Range sends the whole file at once.
    if (r.status === 200) {
      if (offset > 0) throw new Error("Opus download ignored the range");
      return r.bytes;
    }
    size ??= r.total;
    parts.push(r.bytes);
    offset += r.bytes.length;
    if (offset > MAX_BYTES) throw new Error("Opus file too large");
    if (r.bytes.length < want || (size && offset >= size)) break;
  }
  const out = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Downloads the song's Opus, repackages it and returns the file as a stream; throws when anything fails. */
export async function remuxStream(
  track: Track,
  st: ResolvedStream,
): Promise<ResolvedStream> {
  const src = st.opus;
  if (!src) throw new Error("YouTube offered no Opus for this song");
  const t0 = Date.now();
  const webm = await download(src);
  const out = repackageOpus(webm, remuxContainer());
  const file = new File(folder(), `${track.id}.${out.ext}`);
  safeDelete(file);
  file.create();
  file.write(out.bytes);
  kept.push(file);
  while (kept.length > KEEP_FILES) safeDelete(kept.shift() as File);
  logEvent(
    "opus-remux",
    `${track.id}: ${webm.length} B as ${out.ext} in ${Date.now() - t0} ms`,
  );
  return {
    url: file.uri,
    mimeType: out.mimeType,
    bitrate: src.bitrate,
    contentLength: out.bytes.length,
    expiresAt: FAR_FUTURE,
    loudnessDb: st.loudnessDb,
    durationSec: st.durationSec ?? out.durationSec,
    sampleRateHz: 48_000,
    via: REMUX_VIA,
  };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * The engine's `upgrade`: one song at a time, so the next songs don't compete with the one playing for the
 * connection. A song that can't be repackaged stays on AAC and says why in the log.
 */
export function prepareOpus(
  track: Track,
  st: ResolvedStream,
  o?: ResolveOptions,
): Promise<ResolvedStream | undefined> {
  const turn = queue.then(async () => {
    if (!st.opus || !st.via.startsWith("youtube:") || !remuxOpusOn())
      return undefined;
    if (o?.exclude?.includes(REMUX_VIA) || o?.avoid?.includes(REMUX_VIA))
      return undefined;
    try {
      return await remuxStream(track, st);
    } catch (e) {
      logEvent("opus-failed", `${track.id}: ${(e as Error)?.message ?? e}`);
      return undefined;
    }
  });
  queue = turn.catch(() => undefined);
  return turn;
}
