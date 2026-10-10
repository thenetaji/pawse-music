# Changelog

All notable changes to Pawse (called Flow before 0.4.0). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each `vX.Y.Z` tag (`flow-vX.Y.Z` in the old studio repository) builds the iOS and Android apps and publishes them under GitHub Releases.

## [0.6.0] - 2026-10-10

### Added
- **Pawse for Mac, Windows and Linux.** A sidebar, a player bar along the bottom, and a two-column Now Playing with the artwork on the left and live lyrics on the right. Media keys and the system's Now Playing controls work, and the keyboard does too: Space, arrows, Shift+arrows, Ctrl/⌘ F. Downloads are on the releases page and in the README.

### Fixed
- Smoother playback: each song is saved to the phone as it plays and the next one loads ahead, so songs start straight away and stop pausing to buffer.
- A song that failed to load in the background no longer shows an error on the song you're listening to; it's tried again before it's due.
- The player and the app's colours no longer flash grey between songs.
- Dynamic Island: it comes back by itself after iOS ends it, keeps time after seeking, looping and buffering, and play/pause responds the moment you tap.
- Dynamic Island: the expanded view no longer cuts off the controls, and the time fits songs over 10 minutes. The cat's line shows when something happens, like spotting a mouse.

## [0.5.0] - 2026-10-09

### Added
- Mochi dances to the song's mood: bouncing for hype, swaying with eyes closed for chill, heart eyes for love songs and a little tear for sad ones. Same in the Dynamic Island.
- Tap the song title in Now Playing to open its album, or the artist name to open the artist. Works for radio and video songs too.
- "Remove from Home & history" in the song menu on Home and History: the song leaves your history and stops showing in Quick picks, Jump back in and the other Home rows.
- The Dynamic Island takes the artwork's colour, has a previous button, and says what Mochi is up to.
- A new black icon, Noir. On iPhone you can switch to Midnight (the previous icon) or Graphite in Settings → Appearance.
- Following an artist now counts: they show under Your artists in Library, their new releases come first on Home, and you're subscribed on YouTube too when signed in.

### Fixed
- Queue swipes: a short swipe now only shows the button, a swipe back or a tap cancels, and only a long swipe acts at once. Play next and Remove both offer Undo.
- Queue swipes were cut off by the reorder gesture; reordering now only reacts to up and down drags, and the dragged row lifts.
- "Hide explicit songs" now also covers Jump back in, On repeat and the other rows built from your history.
- "Top songs ›", "Albums ›" and other "›" links open the full list (artist top songs, discography, singles and more).
- Pulling down on an artist page no longer slides the photo over the songs.
- History shows each song once per day with its play count, instead of a row for every play. Swiping a row shows a Remove button instead of deleting straight away.

## [0.4.0] - 2026-10-09

Flow is now **Pawse** (say it like "pause"), and it's open source.

### Added
- Open source under GPL-3.0 at https://github.com/thenetaji/pawse-music, with install guides, build and release docs.
- A new icon: a paw with a pause button.

### Changed
- The app is called Pawse. It's the same app: it installs over Flow and keeps your library and settings.
- Updates, the SideStore source and the download links now come from the new repository. Releases are tagged `v1.2.3`, and `releases/latest/download/Pawse.ipa` and `Pawse.apk` always point at the newest build.
- About shows who made it.
- Android looks the part: a near-black tab bar with labels and a soft accent pill, a glassy mini player, and Inter for headings.
- Counts read naturally ("1 song", "2 songs").
- Region and feed language follow your phone by default (Automatic), falling back to Worldwide and English. Pick any of 22 countries, Worldwide, or 18 languages in Settings. The old India and English defaults move to Automatic once.

### Fixed
- Android: songs no longer fail with "Source error" and skip. Pawse picks YouTube streams Android can play, tries another one if a stream fails, and starts streams faster.
- iPhone: the empty mini player bar no longer shows when nothing is playing.

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

[0.4.0]: https://github.com/thenetaji/pawse-music/releases/tag/v0.4.0
[0.3.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.3.0
[0.2.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.2.0
[0.1.10]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.10
[0.1.9]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.9
[0.1.8]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.8
[0.1.7]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.7
