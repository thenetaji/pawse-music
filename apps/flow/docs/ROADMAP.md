# Flow roadmap

## v1 (building now)
- Playback: background, lock screen and Control Center, AirPlay, queue, shuffle and repeat, endless radio, resume, sleep timer, normalisation.
- YouTube Music catalog: home, search, album, artist, playlist, radio, lyrics.
- Sign-in, used only for the feed, likes and play reporting. Streams are always signed out.
- JioSaavn 320 kbps as an option, and as a fallback when YouTube fails.
- Now playing: artwork-colour field, the cat on the progress wire, the current lyric line, full lyrics, queue.
- Dynamic Island and lock screen Live Activity with the cat. The cat is always there; there is no toggle.
- iOS IPA and Android APK from GitHub Actions, plus a SideStore source for updates.

## Later
- **Lyrics in the Dynamic Island and the Live Activity.** Show the current line next to the cat, or on a switch. Left out of v1 on purpose.
- Offline downloads, including auto-download on like.
- Video mode (music videos), with care for the lock-screen handoff (react-native-video takes over Now Playing, see RNTP #2679).
- Home-screen and lock-screen widgets, and a StandBy view.
- Listening stats and Wrapped-style share cards.
- More cat moods tied to listening: streaks, late-night, first play of a new artist.
- yt-dlp fallback on the VPS, used when on-device stream clients fail.
- Local files.
- CarPlay. It needs the entitlement, so it needs a paid Apple account.
