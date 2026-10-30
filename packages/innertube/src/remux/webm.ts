import { type OpusAudio, type OpusHead, parseOpusHead } from "./opus";

const ID = {
  segment: 0x18538067,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  trackNumber: 0xd7,
  trackType: 0x83,
  codecId: 0x86,
  codecPrivate: 0x63a2,
  cluster: 0x1f43b675,
  simpleBlock: 0xa3,
  blockGroup: 0xa0,
  block: 0xa1,
  discardPadding: 0x75a2,
};
/** Elements that sit beside Cluster in the Segment: one of them ends a Cluster of unknown size. */
const SEGMENT_CHILDREN = new Set([
  ID.cluster,
  ID.tracks,
  0x114d9b74, // SeekHead
  0x1549a966, // Info
  0x1c53bb6b, // Cues
  0x1254c367, // Tags
  0x1043a770, // Chapters
  0x1941a469, // Attachments
]);
const AUDIO = 2;

/** Bytes in an EBML id or size, from the position of the first set bit of its first byte. */
const vintLength = (first: number) => Math.clz32(first) - 23;

interface Element {
  id: number;
  /** Start and end of the payload; `end` is the buffer's end for an element of unknown size. */
  start: number;
  end: number;
  unknownSize: boolean;
}

/** One EBML element header at `pos`, or undefined at a clean end of data. */
function header(
  b: Uint8Array,
  pos: number,
  limit: number,
): Element | undefined {
  if (pos >= limit) return undefined;
  const idLen = vintLength(b[pos]);
  if (idLen > 4) throw new Error("bad EBML element id");
  if (pos + idLen >= limit) throw new Error("truncated EBML header");
  let id = 0;
  for (let i = 0; i < idLen; i++) id = id * 256 + b[pos + i];
  const sizeAt = pos + idLen;
  const first = b[sizeAt];
  const sizeLen = vintLength(first);
  if (sizeLen > 8) throw new Error("bad EBML size");
  if (sizeAt + sizeLen > limit) throw new Error("truncated EBML header");
  let size = first & (0xff >> sizeLen);
  let ones = size === 0xff >> sizeLen;
  for (let i = 1; i < sizeLen; i++) {
    size = size * 256 + b[sizeAt + i];
    if (b[sizeAt + i] !== 0xff) ones = false;
  }
  const start = sizeAt + sizeLen;
  if (ones) return { id, start, end: limit, unknownSize: true };
  if (start + size > limit) throw new Error("truncated EBML element");
  return { id, start, end: start + size, unknownSize: false };
}

function uint(b: Uint8Array, e: Element): number {
  let n = 0;
  for (let i = e.start; i < e.end; i++) n = n * 256 + b[i];
  return n;
}

function sint(b: Uint8Array, e: Element): number {
  if (e.end === e.start) return 0;
  let n = b[e.start] & 0x80 ? -1 : 0;
  for (let i = e.start; i < e.end; i++) n = n * 256 + b[i];
  return n;
}

interface OpusTrack {
  number: number;
  head: OpusHead;
}

function trackEntry(b: Uint8Array, entry: Element): OpusTrack | undefined {
  let number = 0;
  let type = 0;
  let codec = "";
  let priv: Uint8Array | undefined;
  for (let p = entry.start; p < entry.end; ) {
    const e = header(b, p, entry.end);
    if (!e) break;
    if (e.id === ID.trackNumber) number = uint(b, e);
    else if (e.id === ID.trackType) type = uint(b, e);
    else if (e.id === ID.codecId)
      codec = String.fromCharCode(...b.subarray(e.start, e.end));
    else if (e.id === ID.codecPrivate) priv = b.subarray(e.start, e.end);
    p = e.end;
  }
  if (type !== AUDIO || codec !== "A_OPUS") return undefined;
  if (!priv) throw new Error("Opus track without CodecPrivate");
  return { number, head: parseOpusHead(priv) };
}

/** The frame inside a Block: past the track number, the 16-bit timecode and the flags. */
function blockFrame(
  b: Uint8Array,
  e: Element,
  track: number,
): Uint8Array | undefined {
  const first = b[e.start];
  const n = vintLength(first);
  if (n > 8) throw new Error("bad block track number");
  let num = first & (0xff >> n);
  for (let i = 1; i < n; i++) num = num * 256 + b[e.start + i];
  if (num !== track) return undefined;
  const flags = b[e.start + n + 2];
  if (flags & 0x06) throw new Error("laced WebM blocks are not supported");
  return b.subarray(e.start + n + 3, e.end);
}

/**
 * The Opus packets of a WebM file, with the lead-in and the padding the file declares. Only the first Opus
 * audio track is read; a file with laced blocks or cut short is refused rather than half-read.
 */
export function readWebmOpus(b: Uint8Array): OpusAudio {
  let track: OpusTrack | undefined;
  const packets: Uint8Array[] = [];
  let endPadding = 0;

  const block = (e: Element) => {
    if (!track) throw new Error("no Opus audio track before the first block");
    return blockFrame(b, e, track.number);
  };

  /** Reads a Cluster and returns where it ends; one of unknown size ends at the next Segment child. */
  const cluster = (c: Element): number => {
    let p = c.start;
    while (p < c.end) {
      const e = header(b, p, c.end);
      if (!e) break;
      if (c.unknownSize && SEGMENT_CHILDREN.has(e.id)) return p;
      if (e.id === ID.simpleBlock) {
        const f = block(e);
        if (f) packets.push(f);
      } else if (e.id === ID.blockGroup) {
        let frame: Uint8Array | undefined;
        let padNs = 0;
        for (let q = e.start; q < e.end; ) {
          const g = header(b, q, e.end);
          if (!g) break;
          if (g.id === ID.block) frame = block(g);
          else if (g.id === ID.discardPadding) padNs = sint(b, g);
          q = g.end;
        }
        if (frame) {
          packets.push(frame);
          // Only the last block of the file carries padding.
          endPadding = Math.max(0, Math.round((padNs * 48) / 1e6));
        }
      }
      p = e.end;
    }
    return c.end;
  };

  let root = 0;
  while (root < b.length) {
    const top = header(b, root, b.length);
    if (!top) break;
    if (top.id !== ID.segment) {
      root = top.end;
      continue;
    }
    for (let p = top.start; p < top.end; ) {
      const e = header(b, p, top.end);
      if (!e) break;
      if (e.id === ID.tracks) {
        for (let q = e.start; q < e.end; ) {
          const t = header(b, q, e.end);
          if (!t) break;
          if (t.id === ID.trackEntry && !track) track = trackEntry(b, t);
          q = t.end;
        }
      } else if (e.id === ID.cluster) {
        p = cluster(e);
        continue;
      }
      p = e.end;
    }
    break;
  }
  if (!track) throw new Error("no Opus audio track in the WebM");
  if (!packets.length) throw new Error("the WebM has no audio");
  return { head: track.head, packets, endPadding };
}
