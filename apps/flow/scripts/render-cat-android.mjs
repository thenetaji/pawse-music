// Renders the cat (src/features/cat/cat.tsx) to PNG layers for the Android pill and widget.
// Run: node apps/flow/scripts/render-cat-android.mjs (keep the SVG in sync with cat.tsx).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "/home/dev/studio/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(
  here,
  "../modules/flow-island-android/android/src/main/res/drawable-xxhdpi",
);
mkdirSync(out, { recursive: true });
const PX = 240;

function body({ face, look = 0, tilt = 0, hop = 0, blush = 0.35 }) {
  const eyes =
    face === "sleep"
      ? `<g stroke="#3a2416" stroke-width="2.8" stroke-linecap="round" fill="none"><path d="M37.5 70 q6.5 5 13 0"/><path d="M69.5 70 q6.5 5 13 0"/></g>`
      : face === "happy"
        ? `<g stroke="#3a2416" stroke-width="3" stroke-linecap="round" fill="none"><path d="M37.5 72 q6.5 -8 13 0"/><path d="M69.5 72 q6.5 -8 13 0"/></g>`
        : `<g><ellipse cx="44" cy="69" rx="6.6" ry="8" fill="url(#eye)"/><ellipse cx="76" cy="69" rx="6.6" ry="8" fill="url(#eye)"/>
           <g transform="translate(${look} 0)"><circle cx="46.4" cy="66" r="2.6" fill="#fff"/><circle cx="78.4" cy="66" r="2.6" fill="#fff"/>
           <circle cx="42.6" cy="72.5" r="1.1" fill="#fff" opacity="0.8"/><circle cx="74.6" cy="72.5" r="1.1" fill="#fff" opacity="0.8"/></g></g>`;
  return `<g transform="translate(0 ${hop}) rotate(${tilt} 60 100)">
  <ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity="0.18"/>
  <path d="M27 52 L24 15 Q25 11 29 13 L55 36 Z" fill="url(#fur)"/>
  <path d="M93 52 L96 15 Q95 11 91 13 L65 36 Z" fill="url(#fur)"/>
  <path d="M31 44 L29.5 21 L47 37 Z" fill="#F7A9A0" opacity="0.9"/>
  <path d="M89 44 L90.5 21 L73 37 Z" fill="#F7A9A0" opacity="0.9"/>
  <ellipse cx="60" cy="68" rx="41" ry="35" fill="url(#fur)"/>
  <path d="M51 36 q2 7 0 12 M60 34 q1 8 0 14 M69 36 q-2 7 0 12" stroke="#C9661E" stroke-width="3.2" stroke-linecap="round" fill="none" opacity="0.75"/>
  <path d="M20 66 q5 1 9 4 M100 66 q-5 1 -9 4" stroke="#C9661E" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>
  <ellipse cx="60" cy="84" rx="20" ry="14" fill="url(#muzzle)"/>
  <ellipse cx="37" cy="83" rx="7" ry="4.5" fill="#FF8C8C" opacity="${blush}"/>
  <ellipse cx="83" cy="83" rx="7" ry="4.5" fill="#FF8C8C" opacity="${blush}"/>
  ${eyes}
  <path d="M56.5 79.5 h7 q1.2 0 .5 1.1 l-2.8 2.8 q-.7.7-1.4 0 l-2.8-2.8 q-.7-1.1.5-1.1z" fill="#F07C86"/>
  <path d="M60 84 q-1 4 -5.5 4 M60 84 q1 4 5.5 4" stroke="#7a4a32" stroke-width="1.8" stroke-linecap="round" fill="none"/>
  <path d="M40 86 l-17 -2 M40 89.5 l-16 3 M80 86 l17 -2 M80 89.5 l16 3" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/>
  <path d="M19 66 C17 20 103 20 101 66" stroke="#2B2B36" stroke-width="6.5" fill="none" stroke-linecap="round"/>
  <path d="M22 50 C30 27 90 27 98 50" stroke="#fff" stroke-width="1.4" fill="none" opacity="0.18"/>
  <rect x="9" y="55" width="17" height="30" rx="8.5" fill="url(#cup)"/>
  <rect x="94" y="55" width="17" height="30" rx="8.5" fill="url(#cup)"/>
  <rect x="12" y="58" width="5" height="12" rx="2.5" fill="#fff" opacity="0.28"/>
  <rect x="97" y="58" width="5" height="12" rx="2.5" fill="#fff" opacity="0.28"/>
</g>`;
}

const acc = {
  note: `<path d="M104 22 v-13 l9 -2.5 v12" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="101.5" cy="22.5" rx="3.6" ry="2.8" fill="#fff"/><ellipse cx="110.5" cy="19.5" rx="3.6" ry="2.8" fill="#fff"/>`,
  zz: `<g fill="#fff" font-family="sans-serif" font-weight="800"><text x="98" y="26" font-size="15">z</text><text x="108" y="14" font-size="10">z</text></g>`,
  heart: `<path d="M108 20 c-6-4-9-7-9-10.5 0-2.5 2-4.3 4.3-4.3 1.8 0 3.3 1 4.7 2.8 1.4-1.8 2.9-2.8 4.7-2.8 2.3 0 4.3 1.8 4.3 4.3 0 3.5-3 6.5-9 10.5z" fill="#FF5A7A"/>`,
};

const defs = `<defs>
  <radialGradient id="fur" cx="45%" cy="38%" r="70%"><stop offset="0" stop-color="#FFC27A"/><stop offset="0.65" stop-color="#F49A3C"/><stop offset="1" stop-color="#D9772A"/></radialGradient>
  <radialGradient id="muzzle" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#FFF6EA"/><stop offset="1" stop-color="#FBE3C8"/></radialGradient>
  <linearGradient id="cup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B7CFF"/><stop offset="1" stop-color="#4B3BD6"/></linearGradient>
  <radialGradient id="eye" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#5a3b22"/><stop offset="1" stop-color="#1d120a"/></radialGradient>
</defs>`;
const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="0 0 120 120">${defs}${inner}</svg>`;

const files = {
  // Pill layers: the body animates (rotation/hop/breath), the accessory floats on top.
  flow_cat_body_open: svg(body({ face: "open" })),
  flow_cat_body_curious: svg(body({ face: "open", look: 3 })),
  flow_cat_body_sleep: svg(body({ face: "sleep" })),
  flow_cat_body_happy: svg(body({ face: "happy", blush: 0.6 })),
  flow_cat_acc_note: svg(acc.note),
  flow_cat_acc_zz: svg(acc.zz),
  flow_cat_acc_heart: svg(acc.heart),
  // Widget: one static frame per mood.
  flow_cat_groove: svg(body({ face: "open", tilt: -7 }) + acc.note),
  flow_cat_sleep: svg(body({ face: "sleep" }) + acc.zz),
  flow_cat_happy: svg(body({ face: "happy", blush: 0.6 }) + acc.heart),
  flow_cat_curious: svg(body({ face: "open", look: 3, tilt: 9 })),
};

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "/home/dev/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell",
});
const page = await browser.newPage({ viewport: { width: PX, height: PX } });
for (const [name, s] of Object.entries(files)) {
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${s}</body></html>`,
  );
  const buf = await page.locator("svg").screenshot({ omitBackground: true });
  writeFileSync(`${out}/${name}.png`, buf);
}
await browser.close();
console.log("rendered", Object.keys(files).length);
