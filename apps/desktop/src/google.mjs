// Google sign-in, either read from Firefox (firefox.mjs) or in Pawse's own window and cookie jar;
// hands back YouTube Music's cookie header.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, BrowserWindow, safeStorage, session } from "electron";

import { firefoxSession } from "./firefox.mjs";

const START =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
const MUSIC = "https://music.youtube.com";

// In memory only: once Pawse has the cookies, the only copy on disk is the encrypted one below.
const jar = () => session.fromPartition("google");
const SESSION_FILE = () => join(app.getPath("userData"), "session.bin");
// Which Firefox profile the session came from; a path, not a secret.
const SOURCE_FILE = () => join(app.getPath("userData"), "session-source.json");
const BROWSER_REFRESH_MS = 20 * 60_000;
// Google rejects a Chrome user agent that isn't really Chrome; without the version number it lets the
// window through. From Ferdium's userAgentWithoutChromeVersion (Apache-2.0): https://github.com/ferdium/ferdium-app
const chromelessUA = () =>
  app.userAgentFallback
    .replace(/ (Electron|Pawse|pawse-desktop)\/\S+/g, "")
    .replace(/Chrome\/[\d.]+/, "Chrome");

let open = null;

/** Resolves with the cookie header once YouTube Music opens signed in, or null if the window closes first. */
export function signIn(parent) {
  if (open) {
    open.win.focus();
    return open.result;
  }
  const win = new BrowserWindow({
    parent,
    width: 480,
    height: 720,
    title: "Sign in to YouTube Music",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: { session: jar(), sandbox: true, contextIsolation: true },
  });
  win.webContents.setUserAgent(chromelessUA());
  const result = new Promise((resolve) => {
    let done = false;
    const check = async (url) => {
      if (done || !url.startsWith(MUSIC)) return;
      const cookies = await jar().cookies.get({ url: MUSIC });
      if (
        !cookies.some(
          (c) => c.name === "SAPISID" || c.name === "__Secure-3PAPISID",
        )
      )
        return;
      done = true;
      writeSource(null);
      resolve(cookies.map((c) => `${c.name}=${c.value}`).join("; "));
      win.close();
      void jar().clearStorageData();
    };
    win.webContents.on("did-navigate", (_e, url) => void check(url));
    win.webContents.on("did-navigate-in-page", (_e, url) => void check(url));
    win.on("closed", () => {
      open = null;
      if (!done) resolve(null);
    });
  });
  open = { win, result };
  void win.loadURL(START);
  return result;
}

/** Signs in with the newest Firefox profile that has YouTube Music open and signed in. */
export function signInWithBrowser() {
  const found = firefoxSession(readSource()?.db);
  if (!found.cookies) return { error: found.error, browser: found.browser };
  writeSource({ db: found.db });
  writeSession(found.cookies);
  return { cookies: found.cookies, browser: found.browser };
}

/** Re-reads the Firefox sign-in now and then, so Pawse follows Google's cookie refreshes. */
export function watchBrowserSession(send) {
  let last = null;
  return setInterval(() => {
    const src = readSource();
    if (!src) return;
    const found = firefoxSession(src.db);
    if (!found.cookies || found.cookies === last) return;
    last = found.cookies;
    writeSession(found.cookies);
    send(found.cookies);
  }, BROWSER_REFRESH_MS);
}

export async function signOut() {
  writeSession(null);
  await jar().clearStorageData();
}

/** The saved cookie header, decrypted with the OS keychain (Keychain, DPAPI, KWallet or GNOME Keyring). */
export function readSession() {
  // A Firefox sign-in is read fresh at every start, so it works even without a keychain.
  const src = readSource();
  const fresh = src && firefoxSession(src.db).cookies;
  if (fresh) return fresh;
  try {
    if (!existsSync(SESSION_FILE())) return null;
    return safeStorage.decryptString(readFileSync(SESSION_FILE()));
  } catch {
    return null;
  }
}

function readSource() {
  try {
    return JSON.parse(readFileSync(SOURCE_FILE(), "utf8"));
  } catch {
    return null;
  }
}

function writeSource(src) {
  if (!src) return rmSync(SOURCE_FILE(), { force: true });
  writeFileSync(SOURCE_FILE(), JSON.stringify(src), { mode: 0o600 });
}

export function writeSession(cookies) {
  if (!cookies) {
    writeSource(null);
    return rmSync(SESSION_FILE(), { force: true });
  }
  // Without a real keychain (Linux falls back to a fixed key) the session lasts until Pawse quits.
  if (
    !safeStorage.isEncryptionAvailable() ||
    (process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend() === "basic_text")
  )
    return;
  writeFileSync(SESSION_FILE(), safeStorage.encryptString(cookies), {
    mode: 0o600,
  });
}
