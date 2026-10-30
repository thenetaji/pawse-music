import { type OpusAudio, samplesOf, validSamples } from "./opus";

// Opus in ISOBMFF (opus-codec.org/docs/opus_in_isobmff.html). AVPlayer reads it from iOS 17; the file is a plain
// MP4 with the index first, so it also plays while still being copied.
const TIMESCALE = 48_000;
const PREROLL_SAMPLES = 3840; // 80 ms: what an Opus decoder needs after a jump

type Part = Uint8Array | number[];

const u16 = (n: number) => [(n >> 8) & 255, n & 255];
const u32 = (n: number) => [
  (n >>> 24) & 255,
  (n >>> 16) & 255,
  (n >>> 8) & 255,
  n & 255,
];
const u32s = (ns: number[]) => {
  const out = new Uint8Array(ns.length * 4);
  const v = new DataView(out.buffer);
  ns.forEach((n, i) => v.setUint32(i * 4, n));
  return out;
};
const cc = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const zeros = (n: number) => new Array<number>(n).fill(0);

function box(type: string, ...parts: Part[]): Uint8Array {
  const size = 8 + parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  out.set([...u32(size), ...cc(type)]);
  let at = 8;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const full = (type: string, version: number, flags: number, ...parts: Part[]) =>
  box(
    type,
    [version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255],
    ...parts,
  );

const MATRIX = [
  ...u32(0x10000),
  ...u32(0),
  ...u32(0),
  ...u32(0),
  ...u32(0x10000),
  ...u32(0),
  ...u32(0),
  ...u32(0),
  ...u32(0x40000000),
];

function dOps(a: OpusAudio): Uint8Array {
  const h = a.head;
  return box(
    "dOps",
    [0, h.channels],
    u16(h.preSkip),
    u32(h.inputRate),
    u16(h.gain & 0xffff),
    [h.mappingFamily],
    h.mappingFamily === 0 ? [] : [h.streams, h.coupled, ...h.mapping],
  );
}

/** Runs of equal sample durations as (count, delta) pairs. */
function runs(durations: number[]): number[] {
  const out: number[] = [];
  for (const d of durations) {
    const n = out.length;
    if (n && out[n - 1] === d) out[n - 2]++;
    else out.push(1, d);
  }
  return out;
}

function moov(
  a: OpusAudio,
  sizes: number[],
  durations: number[],
  dataOffset: number,
): Uint8Array {
  const media = durations.reduce((x, y) => x + y, 0);
  const valid = validSamples(a, durations);
  const pairs = runs(durations);
  const sampleEntry = box(
    "Opus",
    zeros(6),
    u16(1),
    zeros(8),
    // The channel count is the number of decoded channels in the streams, which is what dOps' table describes.
    u16(a.head.streams + a.head.coupled),
    u16(16),
    zeros(4),
    u32(TIMESCALE * 65536),
    dOps(a),
  );
  const stbl = box(
    "stbl",
    full("stsd", 0, 0, u32(1), sampleEntry),
    full("stts", 0, 0, u32(pairs.length / 2), u32s(pairs)),
    full("stsc", 0, 0, u32(1), u32(1), u32(sizes.length), u32(1)),
    full("stsz", 0, 0, u32(0), u32(sizes.length), u32s(sizes)),
    full("stco", 0, 0, u32(1), u32(dataOffset)),
    // Every sample is a sync sample, but a decoder needs 80 ms of earlier audio to be exact after a jump.
    full(
      "sgpd",
      1,
      0,
      cc("roll"),
      u32(2),
      u32(1),
      u16(-Math.ceil(PREROLL_SAMPLES / durations[0]) & 0xffff),
    ),
    full("sbgp", 0, 0, cc("roll"), u32(1), u32(sizes.length), u32(1)),
  );
  const minf = box(
    "minf",
    full("smhd", 0, 0, zeros(4)),
    box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1))),
    stbl,
  );
  const mdia = box(
    "mdia",
    full(
      "mdhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(TIMESCALE),
      u32(media),
      u16(0x55c4),
      u16(0),
    ),
    full("hdlr", 0, 0, u32(0), cc("soun"), zeros(12), [
      ...cc("SoundHandler"),
      0,
    ]),
    minf,
  );
  const trak = box(
    "trak",
    full(
      "tkhd",
      0,
      3,
      u32(0),
      u32(0),
      u32(1),
      u32(0),
      u32(valid),
      zeros(8),
      u16(0),
      u16(0),
      u16(0x100),
      u16(0),
      MATRIX,
      u32(0),
      u32(0),
    ),
    // The edit list is what drops the lead-in; players that ignore dOps' PreSkip still start on the music.
    box(
      "edts",
      full(
        "elst",
        0,
        0,
        u32(1),
        u32(valid),
        u32(a.head.preSkip),
        u16(1),
        u16(0),
      ),
    ),
    mdia,
  );
  return box(
    "moov",
    full(
      "mvhd",
      0,
      0,
      u32(0),
      u32(0),
      u32(TIMESCALE),
      u32(valid),
      u32(0x10000),
      u16(0x100),
      zeros(10),
      MATRIX,
      zeros(24),
      u32(2),
    ),
    trak,
  );
}

/** The Opus audio as an MP4 (`.m4a`): index first, then the packets in one run, nothing re-encoded. */
export function opusToMp4(a: OpusAudio): Uint8Array {
  const durations = samplesOf(a);
  const sizes = a.packets.map((p) => p.length);
  const ftyp = box(
    "ftyp",
    cc("isom"),
    u32(512),
    cc("isom"),
    cc("iso2"),
    cc("mp41"),
  );
  const index = moov(a, sizes, durations, 0).length;
  const head = moov(a, sizes, durations, ftyp.length + index + 8);
  const payload = sizes.reduce((x, y) => x + y, 0);
  const out = new Uint8Array(ftyp.length + head.length + 8 + payload);
  out.set(ftyp);
  out.set(head, ftyp.length);
  let at = ftyp.length + head.length;
  out.set([...u32(8 + payload), ...cc("mdat")], at);
  at += 8;
  for (const p of a.packets) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
