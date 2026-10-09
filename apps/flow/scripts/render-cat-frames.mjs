// Renders the cat (src/features/cat/cat.tsx) and mouse (mouse.tsx) to PNG frames for the Live Activity widget.
// Run: node apps/flow/scripts/render-cat-frames.mjs (keep the SVG and FUR in sync with cat.tsx).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "/home/dev/studio/node_modules/playwright/index.mjs";

const CHROME =
  process.env.CHROME_PATH ??
  "/home/dev/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "../targets/live-activity/Assets.xcassets");
// Points; only @2x and @3x ship (every iOS 17 device is 2x or 3x).
const FULL_PT = 64;
const HEAD_PT = 24;
const MOUSE_PT = 32;
const SCALES = [2, 3];
const CUPS = ["#8B7CFF", "#4B3BD6"];

// Same palette as FUR in cat.tsx.
const FUR = {
  orange: {
    fur: ["#FFC27A", "#F49A3C", "#D9772A"],
    stripe: "#C9661E",
    muzzle: ["#FFF6EA", "#FBE3C8"],
  },
  black: {
    fur: ["#5A5A66", "#2E2E36", "#1C1C22"],
    stripe: "#141418",
    muzzle: ["#6E6E7A", "#4A4A54"],
  },
  white: {
    fur: ["#FFFFFF", "#F1EEE9", "#D9D4CC"],
    stripe: "#CFC8BD",
    muzzle: ["#FFFFFF", "#F4EFE8"],
  },
  grey: {
    fur: ["#C9CDD6", "#9AA0AD", "#7B8190"],
    stripe: "#6A7080",
    muzzle: ["#F2F3F6", "#DADDE4"],
  },
};

// Full frames (expanded, lock screen): the cat.tsx state at one tick. "look" eyes the mouse on its left.
const FULL = {
  "groove-a": { mood: "groove", frame: 0 },
  "groove-b": { mood: "groove", frame: 1 },
  "sleep-a": { mood: "sleep", frame: 0 },
  "sleep-b": { mood: "sleep", frame: 1 },
  happy: { mood: "happy", frame: 1 },
  curious: { mood: "curious", frame: 0 },
  look: { mood: "look", frame: 0 },
};
// Head frames (compact, minimal): no shadow, notes or hop, tight crop.
const HEAD = {
  "head-groove-a": { mood: "groove", frame: 0 },
  "head-groove-b": { mood: "groove", frame: 1 },
  "head-sleep-a": { mood: "sleep", frame: 0 },
  "head-sleep-b": { mood: "sleep", frame: 1 },
  "head-happy": { mood: "happy", frame: 1 },
  "head-curious": { mood: "curious", frame: 0 },
};

function catSvg({ mood, frame, color, head, viewBox, pt }) {
  const f = FUR[color];
  const dark = color === "black";
  const ink = dark ? "#E9E3DA" : "#3a2416";
  const odd = frame % 2 === 1;
  // Heads rock around their own centre so the crop stays steady.
  const pivot = head ? "60 64" : "60 100";
  let tilt = mood === "groove" ? (odd ? 7 : -7) : mood === "curious" ? 9 : 0;
  if (mood === "look") tilt = -6;
  if (head && mood === "groove") tilt = odd ? 6 : -6;
  const hop = !head && mood === "happy" && odd ? -7 : 0;
  const look =
    mood === "curious" ? [3, 0] : mood === "look" ? [-3.4, 1.6] : [0, 0];
  const blush = mood === "happy" ? 0.6 : 0.35;

  const eyes =
    mood === "sleep"
      ? `<g stroke="${ink}" stroke-width="2.8" stroke-linecap="round" fill="none">
          <path d="M37.5 70 q6.5 5 13 0" /><path d="M69.5 70 q6.5 5 13 0" /></g>`
      : mood === "happy"
        ? `<g stroke="${ink}" stroke-width="3" stroke-linecap="round" fill="none">
          <path d="M37.5 72 q6.5 -8 13 0" /><path d="M69.5 72 q6.5 -8 13 0" /></g>`
        : `<g>
          <g transform="translate(${look[0] / 2} ${look[1] / 2})">
            <ellipse cx="44" cy="69" rx="6.6" ry="8" fill="url(#eye)" />
            <ellipse cx="76" cy="69" rx="6.6" ry="8" fill="url(#eye)" />
          </g>
          <g transform="translate(${look[0]} ${look[1]})">
            <circle cx="46.4" cy="66" r="2.6" fill="#fff" />
            <circle cx="78.4" cy="66" r="2.6" fill="#fff" />
            <circle cx="42.6" cy="72.5" r="1.1" fill="#fff" opacity="0.8" />
            <circle cx="74.6" cy="72.5" r="1.1" fill="#fff" opacity="0.8" />
          </g></g>`;

  const extra = head
    ? ""
    : mood === "groove"
      ? `<g ${odd ? 'transform="translate(3 -4)"' : ""}>
          <path d="M104 22 v-13 l9 -2.5 v12" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          <ellipse cx="101.5" cy="22.5" rx="3.6" ry="2.8" fill="#fff" />
          <ellipse cx="110.5" cy="19.5" rx="3.6" ry="2.8" fill="#fff" /></g>`
      : mood === "sleep"
        ? `<g ${odd ? 'transform="translate(2 -3)"' : ""} fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif">
          <text x="98" y="26" font-size="15" font-weight="800">z</text>
          <text x="108" y="14" font-size="10" font-weight="800">z</text></g>`
        : mood === "happy"
          ? `<path d="M108 20 c-6-4-9-7-9-10.5 0-2.5 2-4.3 4.3-4.3 1.8 0 3.3 1 4.7 2.8 1.4-1.8 2.9-2.8 4.7-2.8 2.3 0 4.3 1.8 4.3 4.3 0 3.5-3 6.5-9 10.5z" fill="#FF5A7A" />`
          : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pt}" height="${pt}" viewBox="${viewBox ?? "0 0 120 120"}">
  <defs>
    <radialGradient id="fur" cx="45%" cy="38%" r="70%">
      <stop offset="0" stop-color="${f.fur[0]}" /><stop offset="0.65" stop-color="${f.fur[1]}" /><stop offset="1" stop-color="${f.fur[2]}" />
    </radialGradient>
    <radialGradient id="muzzle" cx="50%" cy="40%" r="60%">
      <stop offset="0" stop-color="${f.muzzle[0]}" /><stop offset="1" stop-color="${f.muzzle[1]}" />
    </radialGradient>
    <linearGradient id="cup" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${CUPS[0]}" /><stop offset="1" stop-color="${CUPS[1]}" />
    </linearGradient>
    <radialGradient id="eye" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="${dark ? "#D8F27A" : "#5a3b22"}" /><stop offset="1" stop-color="${dark ? "#7FA61E" : "#1d120a"}" />
    </radialGradient>
  </defs>
  <g id="cat" transform="translate(0 ${hop}) rotate(${tilt} ${pivot})">
    ${head ? "" : '<ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity="0.18" />'}
    <path d="M27 52 L24 15 Q25 11 29 13 L55 36 Z" fill="url(#fur)" />
    <path d="M93 52 L96 15 Q95 11 91 13 L65 36 Z" fill="url(#fur)" />
    <path d="M31 44 L29.5 21 L47 37 Z" fill="#F7A9A0" opacity="0.9" />
    <path d="M89 44 L90.5 21 L73 37 Z" fill="#F7A9A0" opacity="0.9" />
    <ellipse cx="60" cy="68" rx="41" ry="35" fill="url(#fur)" />
    <path d="M51 36 q2 7 0 12 M60 34 q1 8 0 14 M69 36 q-2 7 0 12" stroke="${f.stripe}" stroke-width="3.2" stroke-linecap="round" fill="none" opacity="0.75" />
    <path d="M20 66 q5 1 9 4 M100 66 q-5 1 -9 4" stroke="${f.stripe}" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6" />
    <ellipse cx="60" cy="84" rx="20" ry="14" fill="url(#muzzle)" />
    <ellipse cx="37" cy="83" rx="7" ry="4.5" fill="#FF8C8C" opacity="${blush}" />
    <ellipse cx="83" cy="83" rx="7" ry="4.5" fill="#FF8C8C" opacity="${blush}" />
    ${eyes}
    <path d="M56.5 79.5 h7 q1.2 0 .5 1.1 l-2.8 2.8 q-.7.7-1.4 0 l-2.8-2.8 q-.7-1.1.5-1.1z" fill="#F07C86" />
    <path d="M60 84 q-1 4 -5.5 4 M60 84 q1 4 5.5 4" stroke="#7a4a32" stroke-width="1.8" stroke-linecap="round" fill="none" />
    <path d="M40 86 l-17 -2 M40 89.5 l-16 3 M80 86 l17 -2 M80 89.5 l16 3" stroke="${dark ? "#bbb" : "#fff"}" stroke-width="1.3" stroke-linecap="round" opacity="0.8" />
    <path d="M19 66 C17 20 103 20 101 66" stroke="#2B2B36" stroke-width="6.5" fill="none" stroke-linecap="round" />
    <path d="M22 50 C30 27 90 27 98 50" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.18" />
    <rect x="9" y="55" width="17" height="30" rx="8.5" fill="url(#cup)" />
    <rect x="94" y="55" width="17" height="30" rx="8.5" fill="url(#cup)" />
    <rect x="12" y="58" width="5" height="12" rx="2.5" fill="#fff" opacity="0.28" />
    <rect x="97" y="58" width="5" height="12" rx="2.5" fill="#fff" opacity="0.28" />
  </g>
  ${extra}
</svg>`;
}

// The mouse from mouse.tsx, head and paws only, peeking up from the bottom edge and facing the cat.
// a: ears and eyes over the edge; b: head out, paws on the edge.
const MOUSE = {
  "mouse-peek-a": { dy: 17, paws: false },
  "mouse-peek-b": { dy: 0, paws: true },
};

function mouseSvg({ dy, paws }) {
  const pawMarks = paws
    ? `<ellipse cx="47" cy="52.5" rx="4" ry="3" fill="#C7C2CC" stroke="#8F8894" stroke-width="0.8" />
    <ellipse cx="63" cy="52.5" rx="4" ry="3" fill="#C7C2CC" stroke="#8F8894" stroke-width="0.8" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MOUSE_PT}" height="${MOUSE_PT}" viewBox="30 6 50 50">
  <defs>
    <radialGradient id="mfur" cx="42%" cy="35%" r="72%">
      <stop offset="0" stop-color="#CFCAD3" /><stop offset="0.7" stop-color="#B3ADB8" /><stop offset="1" stop-color="#958F9B" />
    </radialGradient>
  </defs>
  <g transform="translate(0 ${dy})">
    <ellipse cx="52" cy="56" rx="17" ry="11" fill="url(#mfur)" />
    <circle cx="47" cy="22" r="8.5" fill="url(#mfur)" />
    <circle cx="47" cy="22" r="5.4" fill="#F4A9B8" />
    <circle cx="63" cy="21" r="7.5" fill="url(#mfur)" />
    <circle cx="63" cy="21" r="4.6" fill="#F4A9B8" />
    <circle cx="55" cy="35" r="14" fill="url(#mfur)" />
    <ellipse cx="57" cy="41" rx="8" ry="5.5" fill="#DAD5DE" />
    <circle cx="51" cy="32" r="2.6" fill="#1d1418" />
    <circle cx="61.5" cy="32" r="2.6" fill="#1d1418" />
    <circle cx="51.9" cy="31.1" r="0.9" fill="#fff" />
    <circle cx="62.4" cy="31.1" r="0.9" fill="#fff" />
    <circle cx="60" cy="39" r="2.4" fill="#F07C96" />
    <ellipse cx="45" cy="38" rx="3.4" ry="2" fill="#FF8C8C" opacity="0.4" />
    <path d="M64 39 l11 -2.5 M64 40.5 l11 1.5 M53 39 l-10 -2 M53 40.5 l-10 1.5" stroke="#fff" stroke-width="0.9" stroke-linecap="round" opacity="0.8" />
    ${pawMarks}
  </g>
</svg>`;
}

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

// One square crop around every head pose, so the compact cat never jumps between frames.
// Measured from painted pixels: a rotated group's DOM bbox overshoots.
async function headViewBox(page) {
  let box = null;
  for (const spec of Object.values(HEAD)) {
    const svg = catSvg({ ...spec, color: "orange", head: true, pt: 480 });
    const b = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 480, 480);
      let [l, t, r, btm] = [480, 480, 0, 0];
      for (let y = 0; y < 480; y++)
        for (let x = 0; x < 480; x++)
          if (data[(y * 480 + x) * 4 + 3] > 8) {
            l = Math.min(l, x);
            t = Math.min(t, y);
            r = Math.max(r, x + 1);
            btm = Math.max(btm, y + 1);
          }
      return [l / 4, t / 4, r / 4, btm / 4];
    }, svg);
    box = box
      ? [
          Math.min(box[0], b[0]),
          Math.min(box[1], b[1]),
          Math.max(box[2], b[2]),
          Math.max(box[3], b[3]),
        ]
      : b;
  }
  const pad = 1.5;
  const side = Math.max(box[2] - box[0], box[3] - box[1]) + pad * 2;
  const cx = (box[0] + box[2]) / 2;
  const cy = (box[1] + box[3]) / 2;
  return [cx - side / 2, cy - side / 2, side, side]
    .map((n) => n.toFixed(2))
    .join(" ");
}

function writeContents(name) {
  const images = SCALES.map((s) => ({
    idiom: "universal",
    filename: `${name}@${s}x.png`,
    scale: `${s}x`,
  }));
  fs.writeFileSync(
    path.join(OUT, `${name}.imageset`, "Contents.json"),
    json({ images, info: { author: "xcode", version: 1 } }),
  );
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME });
  fs.mkdirSync(OUT, { recursive: true });
  // Old and stale frames go; everything below is regenerated.
  for (const entry of fs.readdirSync(OUT)) {
    if (/^(cat|mouse)-.*\.imageset$/.test(entry))
      fs.rmSync(path.join(OUT, entry), { recursive: true, force: true });
  }
  fs.writeFileSync(
    path.join(OUT, "Contents.json"),
    json({ info: { author: "xcode", version: 1 } }),
  );

  const jobs = [];
  try {
    const probe = await browser.newPage({
      viewport: { width: 120, height: 120 },
    });
    const viewBox = await headViewBox(probe);
    await probe.close();

    for (const color of Object.keys(FUR)) {
      for (const [frame, spec] of Object.entries(FULL))
        jobs.push([
          `cat-${color}-${frame}`,
          catSvg({ ...spec, color, pt: FULL_PT }),
        ]);
      for (const [frame, spec] of Object.entries(HEAD))
        jobs.push([
          `cat-${color}-${frame}`,
          catSvg({ ...spec, color, head: true, viewBox, pt: HEAD_PT }),
        ]);
    }
    for (const [name, spec] of Object.entries(MOUSE))
      jobs.push([name, mouseSvg(spec)]);

    for (const scale of SCALES) {
      const page = await browser.newPage({
        viewport: { width: FULL_PT, height: FULL_PT },
        deviceScaleFactor: scale,
      });
      for (const [name, svg] of jobs) {
        const dir = path.join(OUT, `${name}.imageset`);
        fs.mkdirSync(dir, { recursive: true });
        await page.setContent(
          `<html><body style="margin:0;background:transparent">${svg}</body></html>`,
        );
        await page.locator("svg").screenshot({
          path: path.join(dir, `${name}@${scale}x.png`),
          omitBackground: true,
        });
        if (scale === SCALES[0]) writeContents(name);
      }
      await page.close();
    }
    console.log(`head viewBox: ${viewBox}`);
  } finally {
    await browser.close();
  }
  console.log(
    `Wrote ${jobs.length} frames at ${SCALES.join("x/")}x to ${path.relative(process.cwd(), OUT)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
