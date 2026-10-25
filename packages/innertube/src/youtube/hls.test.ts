import {
  hlsMaster,
  hlsMediaPlaylist,
  parseSegmentIndex,
  smallSegments,
} from "./hls";

// ftyp (24) + moov (16) + a version-0 sidx with two references, as YouTube's DASH audio starts.
function head(): Uint8Array {
  const b = new Uint8Array(40 + 32 + 24);
  const dv = new DataView(b.buffer);
  const box = (at: number, size: number, type: string) => {
    dv.setUint32(at, size);
    for (let i = 0; i < 4; i++) b[at + 4 + i] = type.charCodeAt(i);
  };
  box(0, 24, "ftyp");
  box(24, 16, "moov");
  box(40, 56, "sidx");
  dv.setUint32(40 + 16, 44100); // timescale
  dv.setUint32(40 + 24, 0); // first offset
  dv.setUint16(40 + 30, 2); // reference count
  dv.setUint32(40 + 32, 1000);
  dv.setUint32(40 + 36, 441000);
  dv.setUint32(40 + 44, 500);
  dv.setUint32(40 + 48, 220500);
  return b;
}

test("reads the init size and each fragment's bytes and length from the sidx", () => {
  const index = parseSegmentIndex(head())!;
  expect(index.initSize).toBe(40);
  expect(index.segments).toEqual([
    { offset: 96, size: 1000, durationSec: 10 },
    { offset: 1096, size: 500, durationSec: 5 },
  ]);
  expect(smallSegments(index)).toBe(true);
});

test("the playlist maps the init part and every fragment to byte ranges of the one url", () => {
  const text = hlsMediaPlaylist("https://v/x", parseSegmentIndex(head())!);
  expect(text).toContain('#EXT-X-MAP:URI="https://v/x",BYTERANGE="40@0"');
  expect(text).toContain(
    "#EXTINF:10.000,\n#EXT-X-BYTERANGE:1000@96\nhttps://v/x",
  );
  expect(text).toContain("#EXT-X-BYTERANGE:500@1096");
  expect(text.trim().endsWith("#EXT-X-ENDLIST")).toBe(true);
});

test("a head cut before the sidx ends gives no index", () => {
  expect(parseSegmentIndex(head().slice(0, 80))).toBeUndefined();
});

test("a master with several qualities lists each over one audio group", () => {
  const v = (height: number) => ({
    uri: `v${height}.m3u8`,
    mimeType: 'video/mp4; codecs="avc1.4d401f"',
    bitrate: height * 1000,
    width: (height * 16) / 9,
    height,
    fps: 30,
  });
  const text = hlsMaster([v(480), v(1080)], {
    uri: "a.m3u8",
    mimeType: 'audio/mp4; codecs="mp4a.40.2"',
    bitrate: 128000,
  });
  const lines = text.split("\n");
  expect(lines.filter((l) => l.startsWith("#EXT-X-MEDIA"))).toHaveLength(1);
  const infs = lines.filter((l) => l.startsWith("#EXT-X-STREAM-INF"));
  expect(infs).toHaveLength(2);
  expect(infs[0]).toContain("BANDWIDTH=608000");
  expect(infs[0]).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
  expect(lines[lines.indexOf(infs[1]) + 1]).toBe("v1080.m3u8");
});
