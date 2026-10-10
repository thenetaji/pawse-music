<p align="center">
  <img src="docs/images/icon-rounded.png" width="104" alt="Pawse app icon: an orange cat with headphones" />
</p>

<h1 align="center">Pawse</h1>

<p align="center">
  <b>A free music player for iPhone, Android, Mac, Windows and Linux, with a cat in your Dynamic Island.</b><br />
  <sub>Say it like "pause": a cat's paws, and the button you press on music.</sub>
</p>

<p align="center">
  <a href="https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.ipa"><img alt="Download for iPhone" src="https://img.shields.io/badge/Download-iPhone-111111?style=for-the-badge&logo=apple&logoColor=white" /></a>
  <a href="https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.apk"><img alt="Download for Android" src="https://img.shields.io/badge/Download-Android-3DDC84?style=for-the-badge&logo=android&logoColor=white" /></a>
  <br />
  <a href="https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-mac-arm64.dmg"><img alt="Download for Mac" src="https://img.shields.io/badge/Download-Mac-111111?style=for-the-badge&logo=apple&logoColor=white" /></a>
  <a href="https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-Setup.exe"><img alt="Download for Windows" src="https://img.shields.io/badge/Download-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white" /></a>
  <a href="https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-linux-x86_64.AppImage"><img alt="Download for Linux" src="https://img.shields.io/badge/Download-Linux-E95420?style=for-the-badge&logo=linux&logoColor=white" /></a>
</p>

<p align="center">
  <a href="https://github.com/thenetaji/pawse-music/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/thenetaji/pawse-music?label=version&color=8B7CFF" /></a>
  <a href="LICENSE"><img alt="Licence GPL-3.0" src="https://img.shields.io/badge/licence-GPL--3.0-8B7CFF" /></a>
  <img alt="No ads, no tracking" src="https://img.shields.io/badge/ads-none-8B7CFF" />
</p>

<p align="center">
  <img src="docs/images/hero.jpg" alt="Pawse on iPhone: home, now playing, explore and search" />
</p>

## What it does

<table>
  <tr>
    <td align="center" width="33%"><img src="docs/images/now-playing.png" width="240" alt="Now Playing" /><br /><b>Big, beautiful player</b><br /><sub>The cover fills the screen. Lyrics follow along. Mochi dances on the progress bar.</sub></td>
    <td align="center" width="33%"><img src="docs/images/home.png" width="240" alt="Home with Quick picks" /><br /><b>Picks just for you</b><br /><sub>Quick picks and "Because you like…", learned on your phone. No sign-in needed.</sub></td>
    <td align="center" width="33%"><img src="docs/images/explore.png" width="240" alt="Explore moods and genres" /><br /><b>Something for every mood</b><br /><sub>Chill, workout, focus, sleep, charts and new releases.</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/search.png" width="240" alt="Search results" /><br /><b>All of YouTube Music</b><br /><sub>Songs, albums, artists and playlists, with radio from any song.</sub></td>
    <td align="center"><img src="docs/images/library.png" width="240" alt="Library" /><br /><b>Your library, your phone</b><br /><sub>Likes, playlists, downloads and offline songs. Bring yours over from YouTube Music or Apple Music.</sub></td>
    <td align="center"><img src="docs/images/settings.png" width="240" alt="Settings" /><br /><b>Made to your taste</b><br /><sub>Pick your cat, your colours and your sound quality.</sub></td>
  </tr>
</table>

Also: word-by-word lyrics, a sleep timer, the same loudness for every song, songs that keep playing offline, and a little mouse that keeps teasing the cat.

<p align="center">
  <img src="docs/images/desktop.jpg" width="760" alt="Pawse on a computer: Now Playing with the artwork and live lyrics side by side" /><br />
  <sub>On a computer: the artwork on the left, lyrics that follow along on the right.</sub>
</p>

## Install

### iPhone
1. Install **SideStore** on your iPhone, once: follow [this guide](https://docs.sidestore.io/docs/installation/prerequisites) (you need a computer one time).
2. In SideStore, open **Sources** → tap **+** → paste:
   ```
   https://raw.githubusercontent.com/thenetaji/pawse-music/main/sources/sidestore.json
   ```
3. Tap **Pawse** → **Install**.
4. In SideStore settings, turn on **Background Refresh**, so the app keeps working past 7 days (a free Apple ID limit).

### Android
1. Download **[Pawse.apk](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.apk)**.
2. Open it. If Android asks, allow your browser to **install unknown apps**.
3. Done. Pawse tells you when a new version is out.

### Mac
1. Download **[Pawse for Apple silicon](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-mac-arm64.dmg)** (M1 and newer) or **[for Intel Macs](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-mac-x64.dmg)**.
2. Open it and drag **Pawse** into **Applications**.
3. The first time, macOS says it can't check the app. Open **System Settings → Privacy & Security**, scroll down and click **Open Anyway**. You only do this once.

### Windows
1. Download **[Pawse-Setup.exe](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-Setup.exe)** and open it.
2. If Windows shows "Windows protected your PC", click **More info → Run anyway**. You only do this once.
3. Pawse installs and opens. It's in the Start menu from then on.

### Linux
- **[AppImage](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-linux-x86_64.AppImage)**: make it executable (`chmod +x Pawse-linux-x86_64.AppImage`) and run it.
- **[.deb](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse-linux-amd64.deb)** for Ubuntu, Debian and Mint: `sudo apt install ./Pawse-linux-amd64.deb`.

On a computer, the keyboard works too: **Space** plays and pauses, **← →** jump 10 seconds, **Shift ← →** skip songs, **Ctrl/⌘ F** searches. Media keys and the system's Now Playing controls work as well.

### Updates
- Pawse checks once a day and asks before updating. On a computer it opens the download page for the new version.
- Or open **Settings → About → Check for updates**.

## Good to know

- **No account needed.** Signing in to YouTube Music is optional. It only brings your own home feed, likes and playlists. (Signing in is phone-only for now.)
- **Your data stays on your device.** No ads, no tracking, no Pawse servers. Your Google sign-in is kept in the iPhone Keychain or the Android Keystore.
- **Something wrong?** Open an [issue](https://github.com/thenetaji/pawse-music/issues/new/choose) and paste the log from **Settings → About → Diagnostics**.

<details>
<summary><b>For developers</b></summary>

- **Build it yourself:** [docs/BUILDING.md](docs/BUILDING.md)
- **Make a release:** [docs/RELEASING.md](docs/RELEASING.md)
- **Help out:** [CONTRIBUTING.md](CONTRIBUTING.md)

| Folder | What's inside |
| --- | --- |
| `apps/pawse` | The app: screens, the cat, the Dynamic Island and lock screen (`targets/`), native modules (`modules/`). |
| `apps/desktop` | The Mac, Windows and Linux app: the app's web build in an Electron window, with a small relay for YouTube and audio. |
| `packages/music-core` | Shared types for music, streams and lyrics. |
| `packages/innertube` | YouTube Music, JioSaavn and the lyrics sources. |
| `packages/player` | Playback: queue, radio, stream refresh and loudness. |
| `packages/config` | Shared TypeScript and lint settings. |

</details>

## Licence

Pawse is free and open source under the [GPL-3.0](LICENSE). It plays audio with [@rntp/player](https://rntp.dev), which is free for personal use only, so read [NOTICE.md](NOTICE.md) before you build something on top of it.

Pawse isn't affiliated with YouTube, Google, Apple or JioSaavn. Please use it for your own listening.

## Thanks

Pawse learned a lot from the open-source music apps before it: InnerTune, OuterTune, Metrolist, ViMusic and Echo Music, and from [YouTube.js](https://github.com/LuanRT/YouTube.js) and [ytmusicapi](https://github.com/sigma67/ytmusicapi). Lyrics come from [LRCLIB](https://lrclib.net), Lyrics+, BetterLyrics, KuGou and Unison.

<p align="center"><sub>Made with love by <a href="https://github.com/thenetaji">thenetaji</a> 🐾</sub></p>
