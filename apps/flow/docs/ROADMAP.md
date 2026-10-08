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

### Release
- [ ] 27. Tag flow-v0.1.x, watch the iOS and Android jobs, fix failures, then send the summary.

## Later
- Lyrics in the Dynamic Island and the Live Activity. Left out of v1 on purpose.
- Video mode (music videos), with a careful lock-screen handoff (react-native-video takes over Now Playing; see RNTP #2679).
- StandBy view, and lock-screen widgets on iOS.
- Listening stats and Wrapped-style share cards.
- yt-dlp fallback on the VPS for when on-device stream clients fail (YouTube bot-checks datacenter IPs).
- Local files.
- CarPlay. It needs the entitlement, so a paid Apple account.
- Permanent Android signing key as a GitHub secret. Until then APKs are debug-signed, and a release-signed update will not install over them.

## Notes
- Not for the App Store or Google Play: YouTube's terms, Apple's guidelines 5.2.2/5.2.3, the private JioSaavn API, and the @rntp/player licence (personal use only) all rule it out. Distribute by sideloading (the SideStore source) and by APK.
