// The app's JS sandbox: a hidden offscreen page whose origin is https://www.youtube.com, in its own
// in-memory session. Runs BotGuard (PO tokens) and player challenge code for the renderer.
import { BrowserWindow, session } from "electron";

const PARTITION = "pawse-sandbox"; // no "persist:" prefix, so nothing reaches the disk
const BASE = "https://www.youtube.com/";
const PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title></title></head><body></body></html>',
)}`;
const RUN_MS = 20_000;
const MAX_RUN_MS = 120_000;
const PLATFORM = {
  darwin: "Macintosh; Intel Mac OS X 10_15_7",
  win32: "Windows NT 10.0; Win64; x64",
};

let win;
let page;

// Plain Chrome on this OS: the engine is Chromium, so the page and its requests should say so.
const userAgent = () =>
  `Mozilla/5.0 (${PLATFORM[process.platform] ?? "X11; Linux x86_64"}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split(".")[0]}.0.0.0 Safari/537.36`;

function open() {
  if (page) return page;
  const ses = session.fromPartition(PARTITION);
  ses.setUserAgent(userAgent());
  ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      partition: PARTITION,
      offscreen: true,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  const w = win;
  const wc = w.webContents;
  wc.setAudioMuted(true);
  wc.setFrameRate(1);
  wc.setWindowOpenHandler(() => ({ action: "deny" }));
  wc.on("will-navigate", (e) => e.preventDefault());
  wc.on("render-process-gone", () => closeSandbox());
  w.on("closed", () => {
    if (win === w) win = page = undefined;
  });
  page = wc.loadURL(PAGE, { baseURLForDataURL: BASE }).then(
    () => wc,
    (e) => {
      closeSandbox();
      throw e;
    },
  );
  return page;
}

/** Drops the page (and with it BotGuard's state); the next run opens a fresh one. */
export function closeSandbox() {
  const w = win;
  win = page = undefined;
  if (w && !w.isDestroyed()) w.destroy();
}

/** Runs `code` as the body of an async function in the page; resolves with its result. */
export async function sandboxRun(code, timeoutMs) {
  if (typeof code !== "string") throw new TypeError("code must be a string");
  const ms = Math.min(Math.max(Number(timeoutMs) || RUN_MS, 1000), MAX_RUN_MS);
  const wc = await open();
  let timer;
  try {
    return await Promise.race([
      wc.executeJavaScript(`(async function () {\n${code}\n})()`, true),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          // A run that never answers may have wedged the page; start over.
          closeSandbox();
          reject(new Error(`sandbox run timed out after ${ms} ms`));
        }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
