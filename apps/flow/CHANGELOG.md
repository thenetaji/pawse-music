# Changelog

All notable changes to Flow. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each `flow-vX.Y.Z` tag builds the iOS and Android apps and publishes them under GitHub Releases.

## [0.3.0] - 2026-10-09

### Added
- Tap the Now Playing artwork, or its expand button, to show it edge to edge across the whole screen; tap again to close.
- The mouse visits much more often: on the progress bar it now drops by every 40–75 s ("Now and then") or 20–40 s ("Often"), lives at the far end of the wire from the cat, and has two new tricks (peeking in, and teasing the cat into a lunge). In the Dynamic Island it shows up on most songs and comes back in long ones.
- Word-by-word synced lyrics for many more songs from Lyrics+ (Apple Music lyrics), with Unison as a community fallback matched by the exact YouTube video. Hindi songs from Lyrics+ use romanised (Hinglish) text.

### Changed
- Music videos show their song's square album cover when a confident match exists (no more "725M views" thumbnails), on Now Playing, the mini player, the queue, the lock screen and the islands. Other artwork the system shows is cropped square without black bars.
- Flow's lock-screen card is a slim one-line companion to iOS's own player, and turns into "napping" instead of freezing if Flow was closed.
- Queue swipes commit only past about 40% of the row, with a tick at the commit point and a way back by dragging back; removing a song offers Undo.
- Streaming quality is now one choice per network, Wi-Fi and mobile data: **Automatic** (new default), High or Low. Automatic plays High on Wi-Fi, 5G and 4G, and Low on slower connections or when songs keep stalling. The separate Data saver switch is gone: Low on mobile data saves data everywhere (smaller artwork, nothing kept offline, only the next song prepared). Earlier choices carry over.
- Download quality is High or Low (Normal was identical to High for YouTube).

### Fixed
- Lyrics from the wrong song: every lyrics source must now match the song's title and artist, titles are cleaned before searching ("(From …)", "(Official Video)", "ft. …"), and credit lines no longer appear as sung lines.
- Music videos whose length differs from the song show lyrics as plain text instead of timed lines that drift.
- Each tab always opens on its own home screen.

## [0.2.0] - 2026-10-09

### Added
- **For you on Home**: Quick picks, "Because you like…", On repeat, Forgotten favourites and new releases from artists you play, built on your phone from your plays, likes and skips. Works without signing in.
- **New Library**: Liked, Downloads, Offline and History at a glance; "Made for you" playlists (Top 50, On repeat, Forgotten favourites, Recently played, Recently liked); search, filters and sorting for playlists, albums, artists and songs.
- **Songs kept for offline**: songs you finish are saved automatically within a space limit you choose; the least played make room first.
- **Import**: copy your YouTube Music likes and playlists into Flow so they stay after signing out; import Google Takeout, Apple Music data (privacy.apple.com), Apple Music or iTunes playlist exports and CSV files, with a review step for unsure matches.
- **Quality by network**: separate quality for Wi-Fi and mobile data, plus Data saver (smaller artwork, no offline saving and less prefetching on mobile data).
- **Onboarding** suggests popular artists for your region and languages, and offers import.
- **Search** suggests artists you play and what is trending before you type.
- **Diagnostics** in Settings → About to copy a playback log for bug reports.
- The cat-and-mouse episode now plays in the compact Dynamic Island.

### Changed
- Now Playing artwork fills the top of the screen edge to edge; music videos use their HD frame.
- Downloads and offline options moved from Settings to Library → Downloads.
- Your Google session is stored in the iOS Keychain / Android Keystore.
- Library sync with YouTube runs at most every few hours, only from the Library tab.
- Calmer, shorter animations for sheets, search results and the share card.

### Fixed
- Songs showing the wrong length (for example 7 minutes for a 3-minute song) and playing silence after the real end.
- Sign out now also clears the sign-in browser's Google cookies.
- Home and Explore show the last loaded feed when offline instead of empty placeholders.
- Double taps no longer open the same page twice; a crashing screen shows a retry instead of closing the app.
- Catalog requests time out and retry once instead of hanging.

## [0.1.10] - 2026-10-08

### Changed
- Lighter action sheet animation; crashing screens show a retry.

## [0.1.9] - 2026-10-08

### Added
- iOS update prompt that installs through SideStore.

## [0.1.8] - 2026-10-08

### Added
- Android updates itself from GitHub Releases.

## [0.1.7] - 2026-10-08

### Fixed
- Signing in takes effect immediately and is verified in Settings.
- Background audio safeguards; Settings → About → Show onboarding again.

[0.3.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.3.0
[0.2.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.2.0
[0.1.10]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.10
[0.1.9]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.9
[0.1.8]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.8
[0.1.7]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.7
