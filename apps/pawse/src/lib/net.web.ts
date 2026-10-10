import type { ResolvedStream } from "@pawse/music-core";
import { create } from "zustand";

// Browsers block cross-origin YouTube calls, so they go through the relay: the desktop app's or the preview server's.
// Keep in step with ALLOWED in apps/desktop/src/relay.mjs.
const RELAYED =
  /^https:\/\/([a-z0-9-]+\.)*(youtube\.com|googlevideo\.com|jiosaavn\.com|saavncdn\.com|kugou\.com|boidu\.dev|lrclib\.net|lyricsplus\.prjktla\.my\.id|lyricsplus\.binimum\.org|lyrics-plus-backend\.vercel\.app|lyricsplus\.atomix\.one)\//;

export const appFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (!RELAYED.test(url)) return fetch(input, init);
  // Browsers silently drop these, and YouTube checks them, so the relay sets them instead.
  const kept = new Headers(init?.headers);
  const tunneled: Record<string, string> = {};
  for (const name of ["user-agent", "cookie", "origin", "referer"]) {
    const v = kept.get(name);
    if (v !== null) tunneled[name] = v;
    kept.delete(name);
  }
  const h = Object.keys(tunneled).length
    ? `&h=${encodeURIComponent(JSON.stringify(tunneled))}`
    : "";
  return fetch(`/__proxy?u=${encodeURIComponent(url)}${h}`, {
    ...init,
    headers: kept,
  });
};

/** The audio element can't send headers, so the relay adds the stream's own. */
// Absolute, because the player reads a bare path as a local file.
export const relayStream = (st: ResolvedStream): string =>
  `${globalThis.location?.origin ?? ""}/__proxy?u=${encodeURIComponent(st.url)}${
    st.headers ? `&h=${encodeURIComponent(JSON.stringify(st.headers))}` : ""
  }`;

export type NetworkKind = "wifi" | "cellular" | "offline" | "unknown";

// The web preview assumes Wi-Fi so screenshots show the normal state.
export const networkStore = create<{ kind: NetworkKind }>(() => ({
  kind: "wifi",
}));
export const networkKind = (): NetworkKind => "wifi";
export const refreshNetworkKind = async (): Promise<NetworkKind> => "wifi";
