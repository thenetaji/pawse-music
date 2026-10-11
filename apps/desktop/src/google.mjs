// Google sign-in in its own window and cookie jar; hands back YouTube Music's cookie header.
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { app, BrowserWindow, safeStorage, session } from "electron";

const START =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
const MUSIC = "https://music.youtube.com";

// In memory only: once Pawse has the cookies, the only copy on disk is the encrypted one below.
const jar = () => session.fromPartition("google");
const SESSION_FILE = () => join(app.getPath("userData"), "session.bin");
// Google turns away browsers that name Electron, so the window passes as plain Chrome.
const chromeUA = () =>
  app.userAgentFallback.replace(/ (Electron|Pawse|pawse-desktop)\/\S+/g, "");

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
  win.webContents.setUserAgent(chromeUA());
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

export async function signOut() {
  writeSession(null);
  await jar().clearStorageData();
}

/** The saved cookie header, decrypted with the OS keychain (Keychain, DPAPI, KWallet or GNOME Keyring). */
export function readSession() {
  try {
    if (!existsSync(SESSION_FILE())) return null;
    return safeStorage.decryptString(readFileSync(SESSION_FILE()));
  } catch {
    return null;
  }
}

export function writeSession(cookies) {
  if (!cookies) return rmSync(SESSION_FILE(), { force: true });
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
