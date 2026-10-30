// A tiny WebM/Opus file built by hand for the tests.
const bytes = (n: number, len: number) =>
  Array.from(
    { length: len },
    (_, i) => Math.floor(n / 2 ** (8 * (len - 1 - i))) & 255,
  );

const idBytes = (id: number) => {
  const out: number[] = [];
  for (let n = id; n > 0; n = Math.floor(n / 256)) out.unshift(n & 255);
  return out;
};

export const unknownSize = [0x01, 255, 255, 255, 255, 255, 255, 255];

export function el(id: number, body: number[] | Uint8Array, size?: number[]) {
  const len = body.length;
  const sz = size ?? [
    0x10 | ((len >>> 24) & 0x0f),
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
  ];
  return [...idBytes(id), ...sz, ...body];
}

export const uintEl = (id: number, n: number) =>
  el(id, bytes(n, n > 255 ? 2 : 1));

export function opusHead(preSkip = 312, channels = 2) {
  return [
    ...Array.from("OpusHead", (c) => c.charCodeAt(0)),
    1,
    channels,
    preSkip & 255,
    preSkip >> 8,
    0x80,
    0xbb,
    0,
    0, // 48000 Hz
    0,
    0,
    0,
  ];
}

/** An Opus packet whose TOC says `toc` (0xf8: 20 ms, 0xf0: 10 ms, 0xf9: two 20 ms frames) and whose body is `fill`. */
export const packet = (toc: number, fill: number, len = 5) => [
  toc,
  ...new Array(len - 1).fill(fill),
];

const simpleBlock = (track: number, time: number, frame: number[]) =>
  el(0xa3, [0x80 | track, time >> 8, time & 255, 0x80, ...frame]);

export interface WebmOptions {
  frames: number[][];
  preSkip?: number;
  /** Cluster size is left unknown, as in a live stream. */
  unknownCluster?: boolean;
  /** The last frame goes in a BlockGroup carrying this DiscardPadding (nanoseconds). */
  padNs?: number;
  lacing?: boolean;
  codec?: string;
  split?: number;
}

export function webm(o: WebmOptions): Uint8Array {
  const entry = el(0xae, [
    ...uintEl(0xd7, 1),
    ...uintEl(0x83, 2),
    ...el(
      0x86,
      Array.from(o.codec ?? "A_OPUS", (c) => c.charCodeAt(0)),
    ),
    ...el(0x63a2, opusHead(o.preSkip ?? 312)),
    ...el(0x56aa, bytes(6_500_000, 3)),
  ]);
  const frames = o.frames;
  const blocks = (list: number[][], base: number, lastPadded: boolean) =>
    list.flatMap((f, i) => {
      const t = (base + i) * 20;
      if (lastPadded && i === list.length - 1 && o.padNs !== undefined) {
        const ns = o.padNs;
        return el(0xa0, [
          ...el(0xa1, [0x81, t >> 8, t & 255, o.lacing ? 0x02 : 0, ...f]),
          ...el(0x75a2, bytes(ns, 4)),
        ]);
      }
      const b = simpleBlock(1, t, f);
      if (o.lacing) b[b.length - f.length - 1] = 0x02;
      return b;
    });
  const cut = o.split ?? frames.length;
  const clusterOf = (list: number[][], base: number, last: boolean) => {
    const body = [...uintEl(0xe7, base * 20), ...blocks(list, base, last)];
    return el(0x1f43b675, body, o.unknownCluster ? unknownSize : undefined);
  };
  const segment = [
    ...el(0x1654ae6b, entry),
    ...clusterOf(frames.slice(0, cut), 0, cut === frames.length),
    ...(cut < frames.length ? clusterOf(frames.slice(cut), cut, true) : []),
  ];
  return Uint8Array.from([
    ...el(
      0x1a45dfa3,
      el(
        0x4282,
        Array.from("webm", (c) => c.charCodeAt(0)),
      ),
    ),
    ...el(0x18538067, segment),
  ]);
}
