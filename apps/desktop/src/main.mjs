// Pawse for Mac, Windows and Linux: the app's web build in a window, served from a private
// pawse:// scheme so its storage persists, with YouTube and audio going through relay.mjs.
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow, Menu, protocol, shell } from "electron";

import { relay } from "./relay.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = join(HERE, "..", "web");
const ORIGIN = "pawse://app";
const mac = process.platform === "darwin";
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

const SCROLLBARS =
  "::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-track{background:transparent}" +
  "::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:6px;border:2px solid transparent;background-clip:padding-box}" +
  "::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.26);background-clip:padding-box}" +
  "::-webkit-scrollbar-button{display:none}";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "pawse",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const isFile = (p) =>
  stat(p).then(
    (s) => s.isFile(),
    () => false,
  );

// Same lookup as the preview server: the file, then route.html, then the app shell.
async function serveFile(pathname) {
  let p = normalize(join(WEB, decodeURIComponent(pathname)));
  if (!p.startsWith(WEB + sep) && p !== WEB)
    return new Response("", { status: 403 });
  if (!(await isFile(p))) {
    if (await isFile(join(p, "index.html"))) p = join(p, "index.html");
    else if (await isFile(`${p}.html`)) p = `${p}.html`;
    else p = join(WEB, "index.html");
  }
  return new Response(await readFile(p), {
    headers: {
      "content-type": TYPES[extname(p)] ?? "application/octet-stream",
    },
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#000000",
    title: "Pawse",
    show: false,
    titleBarStyle: mac ? "hiddenInset" : "default",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.once("ready-to-show", () => win.show());
  // Slim dark scrollbars; on a Mac the sidebar's top strip ([data-drag]) also moves the window.
  win.webContents.on("did-finish-load", () => {
    void win.webContents.insertCSS(
      `${SCROLLBARS}${mac ? "[data-drag]{-webkit-app-region:drag}" : ""}`,
    );
  });
  // Links to GitHub, YouTube and the like open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(ORIGIN)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) void shell.openExternal(url);
  });
  // On a Mac, closing the window keeps the music going, like Apple Music.
  if (mac)
    win.on("close", (e) => {
      if (app.quitting) return;
      e.preventDefault();
      win.hide();
    });
  void win.loadURL(`${ORIGIN}/`);
  return win;
}

// The app reads its own version from here to check GitHub for updates.
if (!/\bPawse\//.test(app.userAgentFallback))
  app.userAgentFallback += ` Pawse/${app.getVersion()}`;

if (!app.requestSingleInstanceLock()) app.quit();
else {
  let win = null;
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.on("before-quit", () => {
    app.quitting = true;
  });
  app.on("window-all-closed", () => {
    if (!mac) app.quit();
  });
  app.on("activate", () => win?.show());

  app.whenReady().then(() => {
    protocol.handle("pawse", (request) => {
      const url = new URL(request.url);
      if (url.host !== "app") return new Response("", { status: 404 });
      if (url.pathname !== "/__proxy") return serveFile(url.pathname);
      if (!process.env.PAWSE_DEBUG) return relay(request);
      // PAWSE_DEBUG=1 logs every relayed request, for playback bug reports.
      return relay(request).then((r) => {
        const u = url.searchParams.get("u") ?? "";
        const range = request.headers.get("range") ?? "";
        console.log("relay", request.method, r.status, range, u.slice(0, 90));
        return r;
      });
    });
    if (!mac) Menu.setApplicationMenu(null);
    win = createWindow();
  });
}
