export interface OpusHead {
  channels: number;
  /** Samples at 48 kHz the decoder throws away from the start. */
  preSkip: number;
  inputRate: number;
  /** Q7.8 dB. */
  gain: number;
  mappingFamily: number;
  streams: number;
  coupled: number;
  mapping: number[];
}

/** Opus frame lengths at 48 kHz, by the TOC's config number (RFC 6716 section 3.1). */
const FRAME = [
  ...[480, 960, 1920, 2880], // SILK narrowband
  ...[480, 960, 1920, 2880], // SILK mediumband
  ...[480, 960, 1920, 2880], // SILK wideband
  ...[480, 960], // hybrid super-wideband
  ...[480, 960], // hybrid fullband
  ...[120, 240, 480, 960, 120, 240, 480, 960], // CELT narrowband, wideband
  ...[120, 240, 480, 960, 120, 240, 480, 960], // CELT super-wideband, fullband
];

/** The 48 kHz samples one Opus packet decodes to. */
export function opusPacketSamples(packet: Uint8Array): number {
  if (!packet.length) throw new Error("empty Opus packet");
  const toc = packet[0];
  const code = toc & 3;
  let frames = 1;
  if (code === 1 || code === 2) frames = 2;
  else if (code === 3) {
    if (packet.length < 2) throw new Error("truncated Opus packet");
    frames = packet[1] & 0x3f;
  }
  return FRAME[toc >> 3] * frames;
}

export function parseOpusHead(b: Uint8Array): OpusHead {
  const magic = String.fromCharCode(...b.subarray(0, 8));
  if (b.length < 19 || magic !== "OpusHead")
    throw new Error("CodecPrivate is not an OpusHead");
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const channels = b[9];
  const mappingFamily = b[18];
  const head: OpusHead = {
    channels,
    preSkip: v.getUint16(10, true),
    inputRate: v.getUint32(12, true),
    gain: v.getInt16(16, true),
    mappingFamily,
    streams: 1,
    coupled: channels > 1 ? 1 : 0,
    mapping: [],
  };
  if (mappingFamily !== 0) {
    if (b.length < 21 + channels) throw new Error("truncated OpusHead");
    head.streams = b[19];
    head.coupled = b[20];
    head.mapping = Array.from(b.subarray(21, 21 + channels));
  }
  return head;
}

/** The audio of one Opus stream, ready to be written into another container. */
export interface OpusAudio {
  head: OpusHead;
  packets: Uint8Array[];
  /** 48 kHz samples at the very end that are padding, not music. */
  endPadding: number;
}

export const samplesOf = (a: OpusAudio): number[] =>
  a.packets.map(opusPacketSamples);

/** Samples a listener hears: everything decoded minus the lead-in and the end padding. */
export function validSamples(a: OpusAudio, durations: number[]): number {
  const total = durations.reduce((x, y) => x + y, 0);
  return Math.max(0, total - a.head.preSkip - a.endPadding);
}
