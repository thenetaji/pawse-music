import { repackageOpus } from ".";
import { opusPacketSamples } from "./opus";
import { opusToCaf } from "./caf";
import { opusToMp4 } from "./mp4";
import { packet, webm } from "./fixture";
import { readWebmOpus } from "./webm";

const frames = [
  packet(0xf8, 1),
  packet(0xf8, 2, 7),
  packet(0xf0, 3, 4),
  packet(0xf9, 4, 9),
];

type Node = { type: string; start: number; end: number };
const text = (b: Uint8Array, at: number, n: number) =>
  String.fromCharCode(...b.subarray(at, at + n));

function boxes(b: Uint8Array, start = 0, end = b.length): Node[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Node[] = [];
  for (let p = start; p < end; ) {
    const size = v.getUint32(p);
    out.push({ type: text(b, p + 4, 4), start: p + 8, end: p + size });
    p += size;
  }
  return out;
}
const find = (b: Uint8Array, path: string[], within?: Node): Node => {
  let node = within ?? { type: "", start: 0, end: b.length };
  for (const type of path) {
    const found = boxes(b, node.start, node.end).find((x) => x.type === type);
    if (!found) throw new Error(`no ${type} box`);
    node = found;
  }
  return node;
};

describe("opusPacketSamples", () => {
  it("reads the length from the TOC byte", () => {
    expect(opusPacketSamples(Uint8Array.of(0xf8, 0))).toBe(960);
    expect(opusPacketSamples(Uint8Array.of(0xf0, 0))).toBe(480);
    expect(opusPacketSamples(Uint8Array.of(0xf9, 0))).toBe(1920);
    expect(opusPacketSamples(Uint8Array.of(0x50, 0))).toBe(1920); // SILK wideband, 40 ms
    expect(opusPacketSamples(Uint8Array.of(0xfb, 3))).toBe(2880); // three 20 ms frames
  });
});

describe("readWebmOpus", () => {
  it("returns the packets, pre-skip and channel count", () => {
    const a = readWebmOpus(webm({ frames, preSkip: 312 }));
    expect(a.head).toMatchObject({
      channels: 2,
      preSkip: 312,
      inputRate: 48000,
    });
    expect(a.packets.map((p) => Array.from(p))).toEqual(frames);
    expect(a.endPadding).toBe(0);
  });

  it("reads clusters of unknown size and several clusters", () => {
    const a = readWebmOpus(webm({ frames, unknownCluster: true, split: 2 }));
    expect(a.packets).toHaveLength(4);
  });

  it("takes the end padding from the last BlockGroup", () => {
    const a = readWebmOpus(webm({ frames, padNs: 6_500_000 }));
    expect(a.packets).toHaveLength(4);
    expect(a.endPadding).toBe(312);
  });

  it("refuses laced blocks, other codecs and cut files", () => {
    expect(() => readWebmOpus(webm({ frames, lacing: true }))).toThrow(/laced/);
    expect(() => readWebmOpus(webm({ frames, codec: "A_VORBIS" }))).toThrow(
      /no Opus/,
    );
    const file = webm({ frames });
    expect(() => readWebmOpus(file.subarray(0, file.length - 3))).toThrow(
      /truncated/,
    );
  });
});

describe("opusToMp4", () => {
  const audio = readWebmOpus(webm({ frames, preSkip: 312, padNs: 2_000_000 }));
  const mp4 = opusToMp4(audio);
  const v = new DataView(mp4.buffer, mp4.byteOffset, mp4.byteLength);
  const stbl = find(mp4, ["moov", "trak", "mdia", "minf", "stbl"]);

  it("starts with ftyp and puts the index before the audio", () => {
    expect(boxes(mp4).map((x) => x.type)).toEqual(["ftyp", "moov", "mdat"]);
    expect(text(mp4, 8, 4)).toBe("isom");
  });

  it("describes the track as Opus with a dOps box", () => {
    const stsd = find(mp4, ["stsd"], stbl);
    const entry = { start: stsd.start + 8 + 8, end: stsd.end };
    expect(text(mp4, stsd.start + 12, 4)).toBe("Opus");
    expect(v.getUint16(entry.start + 6 + 2 + 8)).toBe(2); // channelcount
    expect(v.getUint16(entry.start + 6 + 2 + 8 + 2)).toBe(16);
    expect(v.getUint32(entry.start + 6 + 2 + 8 + 8)).toBe(48000 * 65536);
    const dops = find(mp4, ["dOps"], {
      type: "",
      ...entry,
      start: entry.start + 28,
    });
    expect(dops.end - dops.start).toBe(11);
    expect(mp4[dops.start]).toBe(0); // version
    expect(mp4[dops.start + 1]).toBe(2); // output channels
    expect(v.getUint16(dops.start + 2)).toBe(312); // pre-skip, big-endian
    expect(v.getUint32(dops.start + 4)).toBe(48000);
    expect(mp4[dops.start + 10]).toBe(0); // mapping family
  });

  it("lists every sample with its size and duration", () => {
    const stsz = find(mp4, ["stsz"], stbl);
    expect(v.getUint32(stsz.start + 8)).toBe(4);
    expect(
      [0, 1, 2, 3].map((i) => v.getUint32(stsz.start + 12 + 4 * i)),
    ).toEqual(frames.map((f) => f.length));
    const stts = find(mp4, ["stts"], stbl);
    expect(v.getUint32(stts.start + 4)).toBe(3);
    expect([1, 3, 5].map((o) => v.getUint32(stts.start + 8 + 4 * o))).toEqual([
      960, 480, 1920,
    ]);
    expect(v.getUint32(stts.start + 8)).toBe(2); // two 960s in a run
  });

  it("points the chunk offset at the first packet in mdat", () => {
    const stco = find(mp4, ["stco"], stbl);
    const at = v.getUint32(stco.start + 8);
    const mdat = boxes(mp4).find((x) => x.type === "mdat");
    expect(at).toBe(mdat?.start);
    expect(Array.from(mp4.subarray(at, at + frames[0].length))).toEqual(
      frames[0],
    );
    expect(mdat?.end).toBe(mp4.length);
  });

  it("trims the lead-in and the end padding with an edit list", () => {
    const total = 960 + 960 + 480 + 1920;
    const valid = total - 312 - 96;
    const elst = find(mp4, ["moov", "trak", "edts", "elst"]);
    expect(v.getUint32(elst.start + 4)).toBe(1);
    expect(v.getUint32(elst.start + 8)).toBe(valid);
    expect(v.getInt32(elst.start + 12)).toBe(312);
    expect(v.getUint16(elst.start + 16)).toBe(1);
    const mdhd = find(mp4, ["moov", "trak", "mdia", "mdhd"]);
    expect(v.getUint32(mdhd.start + 12)).toBe(48000);
    expect(v.getUint32(mdhd.start + 16)).toBe(total);
    const mvhd = find(mp4, ["moov", "mvhd"]);
    expect(v.getUint32(mvhd.start + 16)).toBe(valid);
  });

  it("marks the 80 ms pre-roll with a roll sample group", () => {
    const sgpd = find(mp4, ["sgpd"], stbl);
    expect(text(mp4, sgpd.start + 4, 4)).toBe("roll");
    expect(v.getInt16(sgpd.start + 8 + 4 + 4)).toBe(-4);
    const sbgp = find(mp4, ["sbgp"], stbl);
    expect(v.getUint32(sbgp.start + 8)).toBe(1);
    expect(v.getUint32(sbgp.start + 12)).toBe(4);
    expect(v.getUint32(sbgp.start + 16)).toBe(1);
  });
});

describe("opusToCaf", () => {
  const uniform = readWebmOpus(
    webm({ frames: frames.slice(0, 2), preSkip: 312 }),
  );
  const caf = opusToCaf(uniform);
  const v = new DataView(caf.buffer, caf.byteOffset, caf.byteLength);

  function chunks(b: Uint8Array) {
    const out: Record<string, Node> = {};
    for (let p = 8; p < b.length; ) {
      const size = Number(
        new DataView(b.buffer, b.byteOffset).getBigUint64(p + 4),
      );
      out[text(b, p, 4)] = {
        type: text(b, p, 4),
        start: p + 12,
        end: p + 12 + size,
      };
      p += 12 + size;
    }
    return out;
  }

  it("writes the file header and an Opus description with 960 frames a packet", () => {
    expect(text(caf, 0, 4)).toBe("caff");
    expect(v.getUint16(4)).toBe(1);
    const desc = chunks(caf).desc;
    expect(v.getFloat64(desc.start)).toBe(48000);
    expect(text(caf, desc.start + 8, 4)).toBe("opus");
    expect(v.getUint32(desc.start + 20)).toBe(960);
    expect(v.getUint32(desc.start + 24)).toBe(2);
  });

  it("lists packet sizes with the priming and valid frames", () => {
    const pakt = chunks(caf).pakt;
    expect(Number(v.getBigInt64(pakt.start))).toBe(2);
    expect(Number(v.getBigInt64(pakt.start + 8))).toBe(1920 - 312);
    expect(v.getInt32(pakt.start + 16)).toBe(312);
    expect(v.getInt32(pakt.start + 20)).toBe(0);
    expect(Array.from(caf.subarray(pakt.start + 24, pakt.end))).toEqual([5, 7]);
  });

  it("stores the packets after a zero edit count", () => {
    const data = chunks(caf).data;
    expect(v.getUint32(data.start)).toBe(0);
    expect(Array.from(caf.subarray(data.start + 4, data.start + 9))).toEqual(
      frames[0],
    );
    expect(data.end).toBe(caf.length);
  });

  it("lists each packet's frames when they differ", () => {
    const mixed = opusToCaf(readWebmOpus(webm({ frames })));
    const m = new DataView(mixed.buffer);
    const c = chunks(mixed);
    expect(m.getUint32(c.desc.start + 20)).toBe(0);
    expect(Array.from(mixed.subarray(c.pakt.start + 24, c.pakt.end))).toEqual([
      5, 0x87, 0x40, 7, 0x87, 0x40, 4, 0x83, 0x60, 9, 0x8f, 0x00,
    ]);
  });
});

describe("repackageOpus", () => {
  it("names the file type and reports the playing time", () => {
    const file = webm({ frames, preSkip: 312 });
    const mp4 = repackageOpus(file, "mp4");
    expect(mp4).toMatchObject({
      ext: "m4a",
      mimeType: 'audio/mp4; codecs="opus"',
    });
    expect(mp4.durationSec).toBeCloseTo((4320 - 312) / 48000, 6);
    expect(repackageOpus(file, "caf")).toMatchObject({
      ext: "caf",
      mimeType: 'audio/x-caf; codecs="opus"',
    });
  });
});
