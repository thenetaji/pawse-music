// Opt-in live check against YouTube Music, JioSaavn and the lyrics hosts.
// Run: pnpm --filter @pawse/innertube smoke   (pnpm dlx tsx scripts/smoke.mts)
import type { ResolvedStream } from "@pawse/music-core";

import { JioSaavn, LyricsService, YouTubeMusic } from "../src/index";

const MIB = 1 << 20;
const yt = new YouTubeMusic({ clientsConfigUrl: null });
const saavn = new JioSaavn();
const lyrics = new LyricsService({ youtube: yt });
let failures = 0;

async function step<T>(
  name: string,
  fn: () => Promise<T>,
  describe: (v: T) => string,
): Promise<T | undefined> {
  const t0 = Date.now();
  try {
    const v = await fn();
    console.log(
      `ok   ${name.padEnd(22)} ${String(Date.now() - t0).padStart(5)}ms  ${describe(v)}`,
    );
    return v;
  } catch (e) {
    failures++;
    console.log(
      `FAIL ${name.padEnd(22)} ${String(Date.now() - t0).padStart(5)}ms  ${(e as Error)?.message ?? e}`,
    );
    return undefined;
  }
}

async function downloadAll(s: ResolvedStream): Promise<string> {
  const total = s.contentLength ?? 0;
  if (!total) throw new Error("no contentLength");
  let got = 0;
  for (let start = 0; start < total; start += MIB) {
    const end = Math.min(start + MIB, total) - 1;
    const res = await fetch(s.url, {
      headers: { ...s.headers, Range: `bytes=${start}-${end}` },
    });
    if (res.status !== 206 && res.status !== 200)
      throw new Error(`HTTP ${res.status} at byte ${start}`);
    got += (await res.arrayBuffer()).byteLength;
  }
  if (got !== total) throw new Error(`got ${got} of ${total} bytes`);
  return `${(total / MIB).toFixed(2)} MiB in ${Math.ceil(total / MIB)} ranges, no 403`;
}

await step(
  "bootstrap ytcfg",
  () => yt.warmup(),
  () => "clientVersion + visitorData",
);
const home = await step(
  "home",
  () => yt.home(),
  (h) =>
    `${h.chips.length} chips, ${h.shelves.length} shelves, cont=${!!h.continuation}`,
);
if (home?.continuation)
  await step(
    "home more",
    () => yt.homeMore(home.continuation!),
    (h) => `${h.shelves.length} shelves`,
  );
await step(
  "explore",
  () => yt.explore(),
  (e) =>
    `${e.shelves.map((s) => `${s.title}(${s.items.length})`).join(" ")}; ${e.moods.length} moods`,
);
const tiles = await step(
  "moods & genres",
  () => yt.moodsAndGenres(),
  (t) => `${t.length} tiles, first ${t[0]?.title} ${t[0]?.color}`,
);
if (tiles?.length)
  await step(
    "mood page",
    () => yt.moodPage(tiles[0].params),
    (s) => s.map((x) => `${x.title}(${x.items.length})`).join(" "),
  );
for (const c of ["IN", "ZZ"])
  await step(
    `charts ${c}`,
    () => yt.charts(c),
    (s) => s.map((x) => `${x.title}(${x.items.length})`).join(" "),
  );
await step(
  "charts countries",
  () => yt.chartsCountries(),
  (c) => `${c.length} countries, IN=${c.some((x) => x.code === "IN")}`,
);
await step(
  "new releases",
  () => yt.newReleases(),
  (s) => s.map((x) => `${x.title}(${x.items.length})`).join(" "),
);
await step(
  "suggestions",
  () => yt.suggestions("blinding"),
  (s) => s.slice(0, 3).join(" | "),
);
const all = await step(
  "search all",
  () => yt.search("blinding lights"),
  (r) =>
    `top=${r.top?.type}:${r.top && "title" in r.top ? r.top.title : ""}; ${r.shelves.map((s) => `${s.title}(${s.items.length})`).join(" ")}`,
);
const songs = await step(
  "search songs",
  () => yt.search("blinding lights", "songs"),
  (r) => `${r.items?.length} items, cont=${!!r.continuation}`,
);
if (songs?.continuation)
  await step(
    "search more",
    () => yt.searchMore(songs.continuation!),
    (r) => `${r.items?.length} items`,
  );
const song = songs?.items?.find((i) => i.type === "track");
const albumId = song?.type === "track" ? song.album?.id : undefined;
const album = albumId
  ? await step(
      "album",
      () => yt.album(albumId),
      (a) =>
        `${a.title} (${a.year}) ${a.tracks.length} tracks, playlist ${a.playlistId}`,
    )
  : undefined;
if (album?.playlistId)
  await step(
    "album via OLAK",
    () => yt.album(album.playlistId!),
    (a) => `${a.id} ${a.tracks.length} tracks`,
  );
const artistId = song?.type === "track" ? song.artists[0]?.id : undefined;
const artist = artistId
  ? await step(
      "artist",
      () => yt.artist(artistId),
      (a) =>
        `${a.name}: ${a.shelves.map((s) => s.title).join(", ")}; radio=${a.radioPlaylistId}`,
    )
  : undefined;
const seeAll = artist?.shelves.find((s) => s.more)?.more;
if (seeAll)
  await step(
    "browse see-all",
    () => yt.browse(seeAll),
    (s) => s.map((x) => `${x.title}(${x.items.length})`).join(" "),
  );
const pl = all?.shelves.find((s) => s.title === "Playlists")?.items[0];
if (pl?.type === "playlist") {
  const p = await step(
    "playlist",
    () => yt.playlist(pl.id),
    (x) => `${x.title}: ${x.tracks.length} tracks, cont=${!!x.continuation}`,
  );
  if (p?.continuation)
    await step(
      "playlist more",
      () => yt.playlistMore(p.continuation!),
      (x) => `${x.tracks.length} tracks`,
    );
}
const videoId = song?.id ?? "J7p4bzqLvCw";
const radio = await step(
  "radio (next)",
  () => yt.upNext({ videoId }),
  (n) =>
    `${n.tracks.length} tracks, lyrics=${n.lyricsBrowseId}, related=${n.relatedBrowseId}`,
);
if (radio?.continuation) {
  await step(
    "radio more",
    () =>
      yt.upNext({
        videoId,
        playlistId: radio.playlistId,
        continuation: radio.continuation,
      }),
    (n) => `${n.tracks.length} tracks`,
  );
}

let stream: ResolvedStream | undefined;
const before = failures;
for (const id of [videoId, "dQw4w9WgXcQ"]) {
  stream = await step(
    `resolve ${id}`,
    () => yt.resolve({ id, source: "youtube", title: "", artists: [] }),
    (s) =>
      `${s.via} ${s.mimeType} ${s.bitrate}bps loud=${s.loudnessDb}dB ttl=${Math.round((s.expiresAt - Date.now()) / 60000)}min`,
  );
  console.log(
    `     attempts: ${yt.lastResolveAttempts.map((a) => `${a.client} ${a.ms}ms${a.error ? ` (${a.error})` : ""}`).join("; ")}`,
  );
  if (stream) break;
}
// A datacenter IP gets bot-checked on some videos; one resolved id is enough.
if (stream) failures = before;
if (stream)
  await step(
    "download itag-140",
    () => downloadAll(stream!),
    (s) => s,
  );

if (song?.type === "track") {
  await step(
    "lyrics",
    () => lyrics.lyrics(song),
    (l) =>
      l
        ? `${l.source} synced=${l.synced} words=${l.lines.some((x) => x.words?.length)} ${l.lines.length} lines`
        : "none",
  );
}
const sv = await step(
  "saavn resolve",
  () =>
    saavn.resolve({
      id: "x",
      source: "youtube",
      title: "Tum Hi Ho",
      artists: [{ name: "Arijit Singh" }],
      durationSec: 262,
    }),
  (s) => `${s.bitrate}bps ${s.url.split("/").pop()}`,
);
if (sv)
  await step(
    "saavn range",
    async () =>
      (await fetch(sv.url, { headers: { Range: "bytes=0-1" } })).status,
    (st) => `HTTP ${st}`,
  );

console.log(failures ? `\n${failures} step(s) failed` : "\nall steps passed");
process.exitCode = failures ? 1 : 0;
