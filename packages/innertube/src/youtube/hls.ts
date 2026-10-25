import { type FetchLike, fetchWithTimeout } from "../util/http";

/** googlevideo slows any single request for more than about 10 MiB to playback speed (yt-dlp's CHUNK_SIZE). */
export const THROTTLE_BYTES = 10 << 20;
const HEAD_BYTES = 64 << 10;
const INDEX_TIMEOUT_MS = 8000;

export interface Segment {
  offset: number;
  size: number;
  durationSec: number;
}

/** A DASH fMP4 file's layout: the init part (ftyp + moov) and the fragments its sidx lists. */
export interface SegmentIndex {
  initSize: number;
  segments: Segment[];
}

const fourcc = (b: Uint8Array, at: number) =>
  String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);

/** Where the sidx box sits in the file's first bytes; `end` may lie past the buffer. */
function findSidx(
  head: Uint8Array,
): { start: number; end: number } | undefined {
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let at = 0;
  while (at + 8 <= head.length) {
    const size = dv.getUint32(at);
    const type = fourcc(head, at + 4);
    if (type === "sidx") return { start: at, end: at + size };
    if (size < 8 || type === "moof" || type === "mdat") return undefined;
    at += size;
  }
  return undefined;
}

/** Reads the segment index from bytes that start at the file's first byte and hold the whole sidx box. */
export function parseSegmentIndex(head: Uint8Array): SegmentIndex | undefined {
  const box = findSidx(head);
  if (!box || box.end > head.length) return undefined;
  const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const version = head[box.start + 8];
  const timescale = dv.getUint32(box.start + 16);
  let at = box.start + 20;
  let firstOffset: number;
  if (version === 0) {
    firstOffset = dv.getUint32(at + 4);
    at += 8;
  } else {
    firstOffset = Number(dv.getBigUint64(at + 8));
    at += 16;
  }
  const count = dv.getUint16(at + 2);
  at += 4;
  if (!timescale || !count || at + count * 12 > box.end) return undefined;
  let offset = box.end + firstOffset;
  const segments: Segment[] = [];
  for (let i = 0; i < count; i++, at += 12) {
    const ref = dv.getUint32(at);
    // A reference to another sidx (hierarchical index) isn't something YouTube serves; bail out.
    if (ref >>> 31) return undefined;
    const size = ref & 0x7fffffff;
    segments.push({
      offset,
      size,
      durationSec: dv.getUint32(at + 4) / timescale,
    });
    offset += size;
  }
  return { initSize: box.start, segments };
}

/** Fetches the head of a DASH fMP4 stream and reads its segment index; undefined when it has none. */
export async function fetchSegmentIndex(
  f: FetchLike,
  url: string,
  headers: Record<string, string> = {},
): Promise<SegmentIndex | undefined> {
  const get = async (end: number) => {
    const res = await fetchWithTimeout(
      f,
      url,
      {
        headers: { ...headers, Range: `bytes=0-${end - 1}` },
        credentials: "omit",
      },
      INDEX_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`index HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  let head = await get(HEAD_BYTES);
  const box = findSidx(head);
  if (!box) return undefined;
  if (box.end > head.length) head = await get(box.end);
  return parseSegmentIndex(head);
}

/** An HLS media playlist over byte ranges of one fMP4 file, so every request stays small. */
export function hlsMediaPlaylist(url: string, index: SegmentIndex): string {
  const longest = Math.max(...index.segments.map((s) => s.durationSec));
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${Math.ceil(longest)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MAP:URI="${url}",BYTERANGE="${index.initSize}@0"`,
  ];
  for (const s of index.segments)
    lines.push(
      `#EXTINF:${s.durationSec.toFixed(3)},`,
      `#EXT-X-BYTERANGE:${s.size}@${s.offset}`,
      url,
    );
  lines.push("#EXT-X-ENDLIST", "");
  return lines.join("\n");
}

/** True when every segment fits one unthrottled request (a playlist over it is safe to use). */
export const smallSegments = (index: SegmentIndex) =>
  index.segments.every((s) => s.size <= THROTTLE_BYTES);

const codecsOf = (mimeType: string) => /codecs="([^"]+)"/.exec(mimeType)?.[1];

/** A master playlist pairing one video playlist with one audio playlist (YouTube serves them as separate files). */
export function hlsMaster(
  video: {
    uri: string;
    mimeType: string;
    bitrate: number;
    width?: number;
    height?: number;
    fps?: number;
  },
  audio: { uri: string; mimeType: string; bitrate: number },
): string {
  const codecs = [codecsOf(video.mimeType), codecsOf(audio.mimeType)]
    .filter(Boolean)
    .join(",");
  const inf = [
    `BANDWIDTH=${Math.round(video.bitrate + audio.bitrate)}`,
    codecs ? `CODECS="${codecs}"` : "",
    video.width && video.height
      ? `RESOLUTION=${video.width}x${video.height}`
      : "",
    video.fps ? `FRAME-RATE=${video.fps.toFixed(3)}` : "",
    'AUDIO="a"',
  ].filter(Boolean);
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audio.uri}"`,
    `#EXT-X-STREAM-INF:${inf.join(",")}`,
    video.uri,
    "",
  ].join("\n");
}
