import { type OpusAudio, samplesOf, validSamples } from "./opus";

// Opus in Core Audio Format (kAudioFormatOpus, iOS 11+), for iPhones older than the iOS 17 that reads it from MP4.
// A CAF packet table needs the same frame count in every packet or a frames-per-packet entry for each one.

const be32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
};
const be64 = (n: number) => {
  const b = new Uint8Array(8);
  const v = new DataView(b.buffer);
  v.setUint32(0, Math.floor(n / 2 ** 32));
  v.setUint32(4, n >>> 0);
  return b;
};
const f64 = (n: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, n);
  return b;
};
const tag = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const chunk = (type: string, ...body: Uint8Array[]) => {
  const data = concat(body);
  return concat([tag(type), be64(data.length), data]);
};

/** CAF's variable-length integer: seven bits a byte, most significant first, the high bit marks "more follows". */
function varint(n: number, out: number[]): void {
  const groups = [n & 0x7f];
  for (let r = Math.floor(n / 128); r > 0; r = Math.floor(r / 128))
    groups.push(r & 0x7f);
  for (let i = groups.length - 1; i >= 0; i--)
    out.push(i ? groups[i] | 0x80 : groups[i]);
}

/** kAudioChannelLayoutTag_Mono, _Stereo, else discrete channels in order. */
const layoutTag = (channels: number) =>
  channels === 1
    ? (100 << 16) | 1
    : channels === 2
      ? (101 << 16) | 2
      : (147 << 16) | channels;

/** The Opus audio as a CAF (`.caf`): the packets untouched, with the lead-in and end padding in the packet table. */
export function opusToCaf(a: OpusAudio): Uint8Array {
  const durations = samplesOf(a);
  const uniform = durations.every((d) => d === durations[0]);
  const valid = validSamples(a, durations);
  const total = durations.reduce((x, y) => x + y, 0);

  const table: number[] = [];
  a.packets.forEach((p, i) => {
    varint(p.length, table);
    if (!uniform) varint(durations[i], table);
  });

  const desc = chunk(
    "desc",
    f64(48_000),
    tag("opus"),
    be32(0),
    be32(0),
    be32(uniform ? durations[0] : 0),
    be32(a.head.channels),
    be32(0),
  );
  const chan = chunk(
    "chan",
    be32(layoutTag(a.head.channels)),
    be32(0),
    be32(0),
  );
  const pakt = chunk(
    "pakt",
    be64(a.packets.length),
    be64(valid),
    be32(a.head.preSkip),
    be32(total - a.head.preSkip - valid),
    Uint8Array.from(table),
  );
  const data = chunk("data", be32(0), ...a.packets);
  return concat([
    tag("caff"),
    Uint8Array.of(0, 1, 0, 0),
    desc,
    chan,
    pakt,
    data,
  ]);
}
