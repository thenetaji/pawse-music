# Pawse research (2026-10-08)

Why Pawse exists, which libraries it uses, and how it gets audio. Re-check the stream section whenever playback breaks: YouTube changes often.

## Prior art
No open-source native iOS app streams YouTube Music with a native queue and lock-screen controls.
- [YTMusicUltimate](https://github.com/dayanch96/YTMusicUltimate): a patch for the official YouTube Music app; you sideload a decrypted IPA. Not a standalone player.
- [Spotube](https://github.com/KRTirtho/spotube): Flutter, sideloaded IPA, Spotify-style metadata plus plugin audio sources.
- [Yattee](https://github.com/yattee/yattee): a YouTube video client. v2 is TestFlight only and needs a self-hosted server.
- Android only: Metrolist (alive), SimpMusic, Harmony Music, Namida.
- Dead or changed:
  - InnerTune: last release 2024-09.
  - ViMusic: archived.
  - OuterTune: dropped YouTube in 0.11 and is now local files only.

## Player: `@rntp/player` 5.x (react-native-track-player v5)
- **Native iOS core.** One `AVPlayer` with a native queue and preloader, so the next track starts with the screen locked without waiting on JS.
- **Lock screen and controls.** Now Playing info plus `MPRemoteCommandCenter` (next/previous/seek), and an `AirPlayButton`.
- **Per-track request headers**, via `AVURLAssetHTTPHeaderFieldsKey`.
- **Expiring URLs.** `replaceMediaItem` lets us swap in a fresh stream URL before a queued track plays.
- **Licence.** Free for personal, non-commercial use only. Commercial use needs a paid licence; v4 (`react-native-track-player@4.1.2`, Apache-2.0) is the fallback.
- **Not chosen:**
  - expo-audio on SDK 57: its playlist has no lock-screen next/previous; that arrives in SDK 58.
  - react-native-audio-api: an audio-graph engine with no queue.
  - expo-av: dead.
- **Formats.** AVFoundation cannot play WebM on iOS 26, so we use AAC in MP4 only: itag 140 (~130 kbps) or 139.

## YouTube streams
- **The VISIONOS InnerTube client** (yt-dlp's default logged-out client) returns direct, unciphered URLs, with no PO token and no JS player.
  - Tested from the VPS on 2026-10-08: status `OK`, itags 139/140/249/250/251 all carried a `url`, and `expiresInSeconds` was 21540 (~6 h).
  - A full download in 1 MiB range chunks delivered every byte, so the "403 after the first MiB" failure did not occur.
  - Context: see `src/sources/youtube/clients.ts`.
- **Limits.** Made-for-kids and age-restricted videos are rejected. If YouTube moves VISIONOS to SABR-only, the direct path dies.
- **Fallback chain** (from Metrolist's innertubex catalog and Zemer's field notes):
  - VISIONOS 1.03 and 1.01 come next.
  - WEB_REMIX direct needs a BotGuard PO token bound to the video id, plus sig/n deciphering.
  - Dead for direct URLs: IOS, ANDROID and WEB_SAFARI (SABR-only), and ANDROID_VR (403 after 1 MiB).
  - Keep the client list as remote config, so a fix does not need an app build ([zemer-cipher](https://github.com/ZemerTeam/zemer-cipher) does this).
- **youtubei.js is not used for streams.** Its React Native path needs about 7 polyfills plus a custom JS evaluator, which is unverified on Hermes, and its parser breaks often. Browse, search and next go through our own thin InnerTube calls (WEB_REMIX context).
- **Server fallback (not built).** yt-dlp `visionos,web` with Deno and the bgutil PO token provider. URLs are IP-bound, so the server would have to proxy the audio.
- **Network.** The phone is on a residential or mobile IP and logged out; no rate limit has been seen. Metrolist retries a 429 only when `Retry-After` is 5 s or less.

## JioSaavn
- **Search.** `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&n=<n>&p=<page>&q=<query>`.
- **Media URL.** `more_info.encrypted_media_url` is base64 of DES-ECB with key `38346591`. Decrypt it, then replace `_96.` with `_320.` for 320 kbps AAC (`audio/mp4`) on `aac.saavncdn.com`.
  - Tested 2026-10-08: "Tum Hi Ho" returned `320kbps: true`, and a range request got 206 `audio/mp4`.
- **Use.** Higher-quality audio for tracks found on YouTube Music. Match by title, artist and duration; otherwise play YouTube audio.

## Lyrics (free, no keys)
In order:
1. LRCLIB (`lrclib.net/api/get`, `/api/search`): synced LRC.
2. KuGou (unofficial).
3. BetterLyrics (`lyrics-api.boidu.dev`): word-level TTML from a third-party host.
4. YouTube Music lyrics, which are unsynced.

## From Flow (terminal player, github.com/thenetaji/Flow)
- **Keep:**
  - Radio from the `RDMM<videoId>` mix playlist.
  - Like → auto-download.
  - Play history with ranges (today, 7d, 30d, all) and sorts (recent, most played).
  - Speed dial.
  - Source-namespaced ids (`j:<saavnId>`).
  - Never-raise bookkeeping around playback.
  - Fetch SponsorBlock segments after playback starts, so they never delay it; for music, the category to skip is `music_offtopic`.
- **Avoid:**
  - Its yt-dlp `android` client (Node runtime).
  - The single third-party Saavn proxy.
  - The unordered quality preference (a `set`).
  - JSON-file playlists: use SQLite.
