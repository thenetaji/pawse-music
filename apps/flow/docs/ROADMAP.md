# Flow roadmap

Work top to bottom, one item at a time. Tick an item (`[x]`) in the same commit that finishes it.

## Done (v0.1.0)
- [x] Playback: background, lock screen, queue, radio refill, resume, sleep timer, normalisation (@studio/player on @rntp/player v5).
- [x] YouTube Music catalog: home, search, album, artist, playlist, radio and lyrics (@studio/innertube). Streams are signed out (VISIONOS chain); sign-in is used only for the feed.
- [x] JioSaavn 320 kbps as an option and as a fallback.
- [x] Now playing: artwork-colour field, the cat on the progress wire, the current lyric line, full lyrics, queue.
- [x] Dynamic Island and lock screen Live Activity with the cat (first version).
- [x] apps.yml builds the IPA and APK; flow-v* tags publish a Release and update the SideStore source.
- [x] Fixed: dragging the progress cat crashed the app (gesture callbacks now run on the JS thread).

## Tonight (approved 2026-10-08)

### Fixes
- [ ] 1. Seek by dragging the cat on device, with haptic ticks; tap anywhere on the wire to jump.
- [ ] 2. Search: fix the crooked layout (field, spacing, alignment). Add result tabs, and browse/genre tiles when the field is empty.
- [ ] 3. Home: infinite scroll (homeMore continuation) and pull to refresh.

### Dynamic Island cat
- [ ] 4. Redesign the compact island to look as clean as the system one: art on the leading side, a small cat on the trailing side sized and centred like the system waveform, a thin progress ring. Clean up the expanded view.
- [ ] 5. Album art in the island: add an ad-hoc codesign step in CI (Frameworks, appex with its entitlements, then the app) so SideStore grants the App Group. Check on device whether the art or the purple fallback shows.

### Cat
- [ ] 6. Cat gestures on now playing:
  - tap: meow/bounce;
  - double-tap: like (heart);
  - long-press: purr while petted.
- [ ] 7. More cat moods:
  - yawn and stretch on resume;
  - livelier dance on loud or fast songs;
  - sleepy at night;
  - excited on the first play of an artist.

### App polish
- [ ] 8. Tab bar: cleaner icons, tint from the song.
- [ ] 9. Mini player: swipe left/right to skip, with a spring animation.
- [ ] 10. Now playing:
  - swipe the art left/right to skip;
  - swipe down to close;
  - haptics on the controls.
- [ ] 11. Queue: a premium redesign with an artwork header, drag to reorder, swipe to remove and smooth animations.
- [ ] 12. Sign-in: a branded screen before the Google page, and a signed-in success state.
- [ ] 13. Settings, in sections:
  - account;
  - playback (quality, loudness, JioSaavn);
  - downloads and storage (cache size, clear);
  - lyrics;
  - island cat on/off;
  - cat episodes on/off;
  - about.
- [ ] 14. About page: version and build number, a link to the source, licences.
- [ ] 15. App icon: a Flow logo with the cat.
- [ ] 16. Premium motion everywhere:
  - shared transitions;
  - springy presses;
  - haptics;
  - skeleton loaders;
  - smooth image fades.

### Features (borrowed from InnerTune / Metrolist)
- [ ] 17. Offline downloads:
  - song, album or playlist;
  - auto-download on like;
  - a Downloads section in Library;
  - offline mode.
- [ ] 18. Library:
  - YouTube Music liked songs and playlists, synced;
  - history;
  - sort and filter;
  - create, rename and reorder playlists;
  - import a playlist by link.
- [ ] 19. Song rows: swipe for "play next" or "add to queue", and a long-press menu.
- [ ] 20. Production quality:
  - skeletons, empty states and error states;
  - retry when offline;
  - an offline banner;
  - image caching;
  - fix every crash found.

### Cat and mouse (fun)
- [ ] 21. In-app episodes of 10–15 s on the now-playing wire:
  - the mouse tugs the headphone cable and the cat chases it;
  - the mouse steals the music note;
  - a sleepy prank while paused.

  They play about once every few songs, never back to back, and also on a double-tap. They can be turned off in Settings.
- [ ] 22. Island cameo: the mouse peeks in for a couple of frames and the cat's eyes follow it.

### Android (approved)
- [ ] 23. Get the APK build green (react-native-cookies jcenter is already patched).
- [ ] 24. A cat pill around the camera cutout:
  - opt-in, with the "Display over other apps" permission;
  - placed and sized from the DisplayCutout API, falling back to top centre;
  - the cat is fully animated here;
  - a one-time battery/autostart tip on Xiaomi, Oppo, Vivo and Realme.
- [ ] 25. A home-screen widget with the cat, the song and controls (if time allows).
- [ ] 26. Confirm minSdk and the supported ABIs. Consider per-ABI APKs to shrink the download.

### Screens (new, useful, premium)
- [ ] 28. Onboarding on first launch:
  - meet and name the cat;
  - pick languages and a few favourite artists (seeds the feed);
  - optional sign-in.
- [ ] 29. Home:
  - "Jump back in" from history;
  - Quick picks;
  - daily mixes from your top artists;
  - mood chips;
  - a time-of-day greeting with the cat ("Mochi is napping");
  - infinite shelves.
- [ ] 30. Explore:
  - colourful moods and genres grid;
  - new releases;
  - charts by country (India and global);
  - a mood/genre page and a charts page.
- [ ] 31. Search:
  - recent searches with artwork;
  - trending;
  - result tabs;
  - a top-result hero card.
- [ ] 32. Library hub: Liked, Downloads, Playlists, Albums, Artists, History and Stats, with sort and filter.
- [ ] 33. History screen grouped by day, with "remove from history".
- [ ] 34. Stats ("Your week"): top songs, artists and minutes, a cat summary card, share as image.
- [ ] 35. Downloads manager: progress, storage used, delete, download-all.
- [ ] 36. Artist:
  - stretchy parallax header;
  - top songs, albums, singles, videos, similar artists;
  - follow (subscribe when signed in).
- [ ] 37. Album and playlist:
  - cover-colour header;
  - edit mode for your own playlists (rename, reorder, remove);
  - download the whole list.
- [ ] 38. Full-screen immersive lyrics; share a lyric card as an image.
- [ ] 39. Share a song as a card image (art, title, cat) or as a link.
- [ ] 40. Sleep timer sheet: the cat curls up as time runs down; the music fades out at the end.

### Premium details everywhere
- [ ] 41. Tab bar:
  - hides on scroll down and returns on scroll up (iOS 26 minimize; custom on Android);
  - mini player accessory with swipe to skip.
- [ ] 42. Large titles that collapse into a blurred header on scroll; stretchy headers on pull.
- [ ] 43. Shared-element feel: the mini player art grows into the full player art; cards zoom into their pages.
- [ ] 44. Native context menus with previews on long-press (songs, albums, playlists).
- [ ] 45. Haptics on every meaningful touch; springy press states; reduce-motion respected.
- [ ] 46. Cat personality in every state:
  - pull to refresh: the cat bats a yarn ball;
  - loading: a paw-print skeleton;
  - offline: the cat asleep in a box;
  - error: the cat knocked something over;
  - empty library: the cat waiting.
- [ ] 47. Smooth image loading (blur-up placeholders); no layout jumps.

### Settings (full list)
- [ ] 48. Account:
  - sign in/out and the account name;
  - sync likes to YouTube;
  - send plays to history;
  - import your YouTube Music library.
- [ ] 49. Playback:
  - audio quality (high, normal, data saver);
  - prefer JioSaavn 320 kbps;
  - same loudness for every song;
  - keep playing radio when the queue ends;
  - resume where you left off;
  - preload the next song;
  - pause when headphones disconnect;
  - sleep timer fade-out.
- [ ] 50. Downloads and storage:
  - download quality;
  - Wi-Fi only;
  - auto-download liked songs;
  - storage used;
  - cache size limit;
  - clear cache;
  - clear downloads.
- [ ] 51. Lyrics:
  - show the live lyric line on now playing;
  - source order;
  - text size;
  - romanised lyrics for Hindi (later).
- [ ] 52. Appearance:
  - accent from artwork or a fixed colour;
  - AMOLED pure black;
  - now-playing background (colour field, blur, black);
  - alternative app icons;
  - reduce motion.
- [ ] 53. Cat:
  - name;
  - the cat on the progress wire;
  - the cat in the island;
  - episode frequency (off, rare, often);
  - meow sounds;
  - cat colour (orange, black, white, grey).
- [ ] 54. Content: feed language and region, explicit filter.
- [ ] 55. Privacy: pause history, clear search history, clear play history.
- [ ] 56. Backup: export and import your library (likes, playlists, history) as a file.
- [ ] 57. Android: the island pill on/off, position offset, battery tip.
- [ ] 58. About:
  - version and build;
  - check for updates (GitHub Release / SideStore source);
  - report a bug (opens a GitHub issue);
  - source code;
  - licences.

### Review before shipping
- [ ] 59. Fresh-context review after the build work: a code review (Opus reviewer) of the diff for bugs, and a design review of screenshots of every screen against "premium". Fix the findings, then re-verify (typecheck, lint, tests, web screenshots, iOS CI build).

### Release
- [ ] 27. After item 59: tag flow-v0.1.x, watch the iOS and Android jobs, fix failures, then send the summary.

## Later
- Lyrics in the Dynamic Island and the Live Activity. Left out of v1 on purpose.
- Video mode (music videos), with a careful lock-screen handoff (react-native-video takes over Now Playing; see RNTP #2679).
- StandBy view, and lock-screen widgets on iOS.
- Listening stats and Wrapped-style share cards.
- yt-dlp fallback on the VPS for when on-device stream clients fail (YouTube bot-checks datacenter IPs).
- Local files.
- CarPlay. It needs the entitlement, so a paid Apple account.
- Permanent Android signing key as a GitHub secret. Until then APKs are debug-signed, and a release-signed update will not install over them.

