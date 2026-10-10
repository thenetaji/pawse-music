# Pawse roadmap

Work top to bottom, one item at a time. Tick an item (`[x]`) in the same commit that finishes it.

## Done (v0.1.0)
- [x] Playback: background, lock screen, queue, radio refill, resume, sleep timer, normalisation (@pawse/player on @rntp/player v5).
- [x] YouTube Music catalog: home, search, album, artist, playlist, radio and lyrics (@pawse/innertube). Streams are signed out (VISIONOS chain); sign-in is used only for the feed.
- [x] JioSaavn 320 kbps as an option and as a fallback.
- [x] Now playing: artwork-colour field, the cat on the progress wire, the current lyric line, full lyrics, queue.
- [x] Dynamic Island and lock screen Live Activity with the cat (first version).
- [x] apps.yml builds the IPA and APK; v* tags publish a Release and update the SideStore source.
- [x] Fixed: dragging the progress cat crashed the app (gesture callbacks now run on the JS thread).

## Tonight (approved 2026-10-08)

### Fixes
- [x] 1. Seek by dragging the cat on device, with haptic ticks; tap anywhere on the wire to jump.
- [x] 2. Search: fix the crooked layout (field, spacing, alignment). Add result tabs, and browse/genre tiles when the field is empty.
- [x] 3. Home: infinite scroll (homeMore continuation) and pull to refresh.

### Dynamic Island cat
- [x] 4. Redesign the compact island to look as clean as the system one: art on the leading side, a small cat on the trailing side sized and centred like the system waveform, a thin progress ring. Clean up the expanded view.
- [x] 5. Album art in the island: add an ad-hoc codesign step in CI (Frameworks, appex with its entitlements, then the app) so SideStore grants the App Group. Check on device whether the art or the purple fallback shows.

### Cat
- [x] 6. Cat gestures on now playing:
  - tap: meow/bounce;
  - double-tap: like (heart);
  - long-press: purr while petted.
- [x] 7. More cat moods:
  - yawn and stretch on resume;
  - livelier dance on loud or fast songs;
  - sleepy at night;
  - excited on the first play of an artist.

### App polish
- [x] 8. Tab bar: cleaner icons, tint from the song.
- [x] 9. Mini player: swipe left/right to skip, with a spring animation.
- [x] 10. Now playing:
  - swipe the art left/right to skip;
  - swipe down to close;
  - haptics on the controls.
- [x] 11. Queue: a premium redesign with an artwork header, drag to reorder, swipe to remove and smooth animations.
- [x] 12. Sign-in: a branded screen before the Google page, and a signed-in success state.
- [x] 13. Settings, in sections:
  - account;
  - playback (quality, loudness, JioSaavn);
  - downloads and storage (cache size, clear);
  - lyrics;
  - island cat on/off;
  - cat episodes on/off;
  - about.
- [x] 14. About page: version and build number, a link to the source, licences.
- [x] 15. App icon: a Pawse logo with the cat.
- [x] 16. Premium motion everywhere:
  - shared transitions;
  - springy presses;
  - haptics;
  - skeleton loaders;
  - smooth image fades.

### Features (borrowed from InnerTune / Metrolist)
- [x] 17. Offline downloads:
  - song, album or playlist;
  - auto-download on like;
  - a Downloads section in Library;
  - offline mode.
- [x] 18. Library:
  - YouTube Music liked songs and playlists, synced;
  - history;
  - sort and filter;
  - create, rename and reorder playlists;
  - import a playlist by link.
- [x] 19. Song rows: swipe for "play next" or "add to queue", and a long-press menu.
- [x] 20. Production quality:
  - skeletons, empty states and error states;
  - retry when offline;
  - an offline banner;
  - image caching;
  - fix every crash found.

### Cat and mouse (fun)
- [x] 21. In-app episodes of 10–15 s on the now-playing wire:
  - the mouse tugs the headphone cable and the cat chases it;
  - the mouse steals the music note;
  - a sleepy prank while paused.

  They play about once every few songs, never back to back, and also on a double-tap. They can be turned off in Settings.
- [x] 22. Island cameo: the mouse peeks in for a couple of frames and the cat's eyes follow it.

### Android (approved)
- [x] 23. Get the APK build green (react-native-cookies jcenter is already patched).
- [x] 24. A cat pill around the camera cutout:
  - opt-in, with the "Display over other apps" permission;
  - placed and sized from the DisplayCutout API, falling back to top centre;
  - the cat is fully animated here;
  - a one-time battery/autostart tip on Xiaomi, Oppo, Vivo and Realme.
- [x] 25. A home-screen widget with the cat, the song and controls (if time allows).
- [x] 26. Confirm minSdk and the supported ABIs. Consider per-ABI APKs to shrink the download.

### Screens (new, useful, premium)
- [x] 28. Onboarding on first launch:
  - meet and name the cat;
  - pick languages and a few favourite artists (seeds the feed);
  - optional sign-in.
- [x] 29. Home:
  - "Jump back in" from history;
  - Quick picks;
  - daily mixes from your top artists;
  - mood chips;
  - a time-of-day greeting with the cat ("Mochi is napping");
  - infinite shelves.
- [x] 30. Explore:
  - colourful moods and genres grid;
  - new releases;
  - charts by country (India and global);
  - a mood/genre page and a charts page.
- [x] 31. Search:
  - recent searches with artwork;
  - trending;
  - result tabs;
  - a top-result hero card.
- [x] 32. Library hub: Liked, Downloads, Playlists, Albums, Artists, History and Stats, with sort and filter.
- [x] 33. History screen grouped by day, with "remove from history".
- [x] 34. Stats ("Your week"): top songs, artists and minutes, a cat summary card, share as image.
- [x] 35. Downloads manager: progress, storage used, delete, download-all.
- [x] 36. Artist:
  - stretchy parallax header;
  - top songs, albums, singles, videos, similar artists;
  - follow (subscribe when signed in).
- [x] 37. Album and playlist:
  - cover-colour header;
  - edit mode for your own playlists (rename, reorder, remove);
  - download the whole list.
- [x] 38. Full-screen immersive lyrics; share a lyric card as an image.
- [x] 39. Share a song as a card image (art, title, cat) or as a link.
- [x] 40. Sleep timer sheet: the cat curls up as time runs down; the music fades out at the end.

### Premium details everywhere
- [x] 41. Tab bar:
  - hides on scroll down and returns on scroll up (iOS 26 minimize; custom on Android);
  - mini player accessory with swipe to skip.
- [x] 42. Large titles that collapse into a blurred header on scroll; stretchy headers on pull.
- [ ] 43. (Later: needs native shared transitions) Shared-element feel: the mini player art grows into the full player art; cards zoom into their pages.
- [ ] 44. (Later: action sheet for now) Native context menus with previews on long-press (songs, albums, playlists).
- [x] 45. Haptics on every meaningful touch; springy press states; reduce-motion respected.
- [x] 46. Cat personality in every state:
  - pull to refresh: the cat bats a yarn ball;
  - loading: a paw-print skeleton;
  - offline: the cat asleep in a box;
  - error: the cat knocked something over;
  - empty library: the cat waiting.
- [ ] 47. Smooth image loading (blur-up placeholders); no layout jumps.

### Settings (full list)
- [x] 48. Account:
  - sign in/out and the account name;
  - sync likes to YouTube;
  - send plays to history;
  - import your YouTube Music library.
- [x] 49. Playback:
  - audio quality (high, normal, data saver);
  - prefer JioSaavn 320 kbps;
  - same loudness for every song;
  - keep playing radio when the queue ends;
  - resume where you left off;
  - preload the next song;
  - pause when headphones disconnect;
  - sleep timer fade-out.
- [x] 50. Downloads and storage:
  - download quality;
  - Wi-Fi only;
  - auto-download liked songs;
  - storage used;
  - cache size limit;
  - clear cache;
  - clear downloads.
- [x] 51. Lyrics:
  - show the live lyric line on now playing;
  - source order;
  - text size;
  - romanised lyrics for Hindi (later).
- [x] 52. Appearance:
  - accent from artwork or a fixed colour;
  - AMOLED pure black;
  - now-playing background (colour field, blur, black);
  - alternative app icons;
  - reduce motion.
- [x] 53. Cat:
  - name;
  - the cat on the progress wire;
  - the cat in the island;
  - episode frequency (off, rare, often);
  - meow sounds;
  - cat colour (orange, black, white, grey).
- [x] 54. Content: feed language and region, explicit filter.
- [x] 55. Privacy: pause history, clear search history, clear play history.
- [x] 56. Backup: export and import your library (likes, playlists, history) as a file.
- [x] 57. Android: the island pill on/off, position offset, battery tip.
- [x] 58. About:
  - version and build;
  - check for updates (GitHub Release / SideStore source);
  - report a bug (opens a GitHub issue);
  - source code;
  - licences.

### Review before shipping
- [x] 59. Fresh-context review after the build work: a code review (Opus reviewer) of the diff for bugs, and a design review of screenshots of every screen against "premium". Fix the findings, then re-verify (typecheck, lint, tests, web screenshots, iOS CI build).

### Release
- [x] 27. After item 59: tag the 0.1.x releases, watch the iOS and Android jobs, fix failures, then send the summary.

## v0.2.0 (approved 2026-10-08)
- [x] 60. Full-bleed Now Playing artwork; HD frames for music videos.
- [x] 61. Real song length (iOS misreads YouTube audio length); end songs on time.
- [x] 62. Robustness: request timeouts and one retry, saved Home/Explore copies, double-tap guard, crash retry screen, diagnostics log.
- [x] 63. Sign out clears the Google session; session kept in Keychain / Keystore.
- [x] 64. Lower ban risk: library sync at most every few hours, only from Library.
- [x] 65. For you on Home, built on the phone (works signed out); onboarding suggests popular artists.
- [x] 66. New Library: tiles, Made for you smart playlists, search, filters, sorting.
- [x] 67. Songs kept for offline (auto cache with a space limit, least played evicted first).
- [x] 68. Quality per network (Wi-Fi / mobile data) and Data saver (smaller images).
- [x] 69. Downloads and offline options moved from Settings to Library → Downloads.
- [x] 70. Import: YouTube Music account copy, Google Takeout, Apple Music data, iTunes/Music export, CSV, with match review.
- [x] 71. Cat-and-mouse episode in the compact Dynamic Island.
- [x] 72. Release notes from CHANGELOG.md; update prompt shows highlights.

## v0.3.0 (approved 2026-10-09)
- [x] 73. Lyrics only from the right song (validated sources, cleaned titles), plus Lyrics+ word-synced lyrics and Unison.
- [x] 74. Automatic streaming quality per network; Low on mobile data replaces the data saver switch.
- [x] 75. Song covers for music videos; square, bar-free system artwork (lock screen, island, Android notification).
- [x] 76. Live Activity: stale date, slim lock-screen companion, no stuck updates.
- [x] 77. Queue swipes with a commit threshold, cancel and Undo.
- [x] 78. Edge-to-edge full-screen artwork.
- [x] 79. More frequent mouse episodes at the far end of the wire; island mouse on most songs.
- [x] 80. Shared CI caches through main.
- [ ] 81. Android: songs skipping, and the pill (waiting for a screenshot and diagnostics).

## Your listening, kept and wrapped (approved 2026-10-10)

The goal: a yearly Wrapped and a monthly recap, like YouTube Music Recap and Apple Music Replay, built from data that is never lost.

### Step 1: collect (next release)
- [ ] 82. Listening journal: every play kept forever on the device (song, artists, album, when it started, how long it played, finished or skipped, and the playlist, album, radio or search it came from), plus likes with times. About 2 MB a year. Pause listening history stops it.
- [ ] 83. Backups carry the journal; restoring merges it without duplicates.

### Step 2: keep it safe (next release)
- [ ] 84. Automatic backup once a day to a folder you pick (iCloud Drive, Google Drive or Files), plus one dated copy per week. No Pawse server.
- [ ] 85. Past plays: import YouTube Music history from Google Takeout and Apple Music play activity from privacy.apple.com, so Wrapped covers the years before Pawse.

### Step 3: Wrapped (later)
- [ ] 86. Yearly Wrapped each December: story cards for minutes listened, top songs, artists and albums, peak hour and day, longest streak, new artists found, mood mix, and the cat's personality from how you listen.
- [ ] 87. Monthly recap at the start of each month: a short version of the same cards.
- [ ] 88. Every card can be shared as an image (reuse the share card).
- [ ] 89. "Your story so far": the same view for any date range, from Library.

## Later
- Lyrics in the Dynamic Island and the Live Activity. Left out of v1 on purpose.
- Video mode (music videos), with a careful lock-screen handoff (react-native-video takes over Now Playing; see RNTP #2679).
- StandBy view, and lock-screen widgets on iOS.
- yt-dlp fallback on the VPS for when on-device stream clients fail (YouTube bot-checks datacenter IPs).
- Local files.
- CarPlay. It needs the entitlement, so a paid Apple account.

