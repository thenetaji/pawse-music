// Reads YouTube Music's sign-in from Firefox's own cookie store, so Google's sign-in happens in a real browser.
// Ported from yt-dlp's --cookies-from-browser (yt_dlp/cookies.py, Unlicense): https://github.com/yt-dlp/yt-dlp
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MUSIC_HOSTS = new Set([
  ".youtube.com",
  "youtube.com",
  "music.youtube.com",
  ".music.youtube.com",
]);
const SIGNED_IN = ["SAPISID", "__Secure-3PAPISID"];

// yt-dlp's _firefox_browser_dirs: XDG (Firefox 147+), the classic folder, Flatpak and Snap.
function roots() {
  const home = homedir();
  if (process.platform === "win32")
    return [
      join(process.env.APPDATA ?? "", "Mozilla/Firefox/Profiles"),
      join(
        process.env.LOCALAPPDATA ?? "",
        "Packages/Mozilla.Firefox_n80bbvh6b1yt2/LocalCache/Roaming/Mozilla/Firefox/Profiles",
      ),
    ];
  if (process.platform === "darwin")
    return [join(home, "Library/Application Support/Firefox/Profiles")];
  const config = process.env.XDG_CONFIG_HOME || join(home, ".config");
  return [
    join(config, "mozilla/firefox"),
    join(home, ".mozilla/firefox"),
    join(home, ".var/app/org.mozilla.firefox/config/mozilla/firefox"),
    join(home, ".var/app/org.mozilla.firefox/.mozilla/firefox"),
    join(home, "snap/firefox/common/.mozilla/firefox"),
  ];
}

// yt-dlp's _firefox_cookie_dbs: <root>/cookies.sqlite, <root>/*/cookies.sqlite, <root>/Profiles/*/cookies.sqlite.
function cookieDbs() {
  const found = [];
  const dirs = (d) => {
    try {
      return readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => join(d, e.name));
    } catch {
      return [];
    }
  };
  for (const root of roots())
    for (const dir of [root, ...dirs(root), ...dirs(join(root, "Profiles"))]) {
      const db = join(dir, "cookies.sqlite");
      if (existsSync(db)) found.push(db);
    }
  // The most recently used profile first, as yt-dlp's _newest picks it.
  return [...new Set(found)].sort((a, b) => mtime(b) - mtime(a));
}

const mtime = (f) => {
  try {
    return Math.max(
      statSync(f).mtimeMs,
      existsSync(`${f}-wal`) ? statSync(`${f}-wal`).mtimeMs : 0,
    );
  } catch {
    return 0;
  }
};

/** A name people recognise for the profile: Developer Edition, Nightly, Flatpak or plain Firefox. */
function label(db) {
  const profile = basename(dirname(db));
  const kind = /dev-edition/i.test(profile)
    ? "Firefox Developer Edition"
    : /nightly/i.test(profile)
      ? "Firefox Nightly"
      : "Firefox";
  return db.includes("org.mozilla.firefox") ? `${kind} (Flatpak)` : kind;
}

// Firefox keeps the file locked and recent writes in the -wal file, so read a private copy of both.
function readCookies(db) {
  const dir = mkdtempSync(join(tmpdir(), "pawse-ff-"));
  try {
    const copy = join(dir, "cookies.sqlite");
    copyFileSync(db, copy);
    if (existsSync(`${db}-wal`)) copyFileSync(`${db}-wal`, `${copy}-wal`);
    const conn = new DatabaseSync(copy);
    try {
      const version = conn.prepare("PRAGMA user_version").get().user_version;
      // Containers keep their own sign-ins; only the default one is the browser's main account.
      const rows = conn
        .prepare(
          "SELECT host, name, value, expiry FROM moz_cookies WHERE host LIKE '%youtube.com' AND NOT INSTR(originAttributes, 'userContextId=')",
        )
        .all();
      // Firefox 142 (schema 16) moved expiry to milliseconds.
      const now = Date.now() / (version >= 16 ? 1 : 1000);
      return rows.filter(
        (r) => MUSIC_HOSTS.has(r.host) && (!r.expiry || r.expiry > now),
      );
    } finally {
      conn.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * The YouTube Music cookie header from the newest Firefox profile that is signed in, or why there is none.
 * `prefer` is a cookies.sqlite path read before the others (the profile used last time).
 */
export function firefoxSession(prefer) {
  const dbs = cookieDbs();
  if (!dbs.length) return { error: "no-firefox" };
  if (prefer && dbs.includes(prefer))
    dbs.unshift(...dbs.splice(dbs.indexOf(prefer), 1));
  for (const db of dbs) {
    let rows;
    try {
      rows = readCookies(db);
    } catch {
      continue;
    }
    if (!rows.some((r) => SIGNED_IN.includes(r.name))) continue;
    // A host-only music.youtube.com cookie beats the same name set for all of youtube.com.
    const byName = new Map();
    for (const r of rows.sort((a, b) => a.host.length - b.host.length))
      byName.set(r.name, r.value);
    const cookies = [...byName].map(([n, v]) => `${n}=${v}`).join("; ");
    return { cookies, db, browser: label(db) };
  }
  return { error: "signed-out", browser: label(dbs[0]) };
}
