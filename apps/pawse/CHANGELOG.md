# Changelog

All notable changes to Pawse (called Flow before 0.4.0). The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Each `vX.Y.Z` tag (`flow-vX.Y.Z` in the old studio repository) builds the iOS and Android apps and publishes them under GitHub Releases.

## [1.13.0] - 2026-10-29

### Added
- **Mood mixes on Home.** Tap 90s & retro, Chill, Loud or Modern for a shuffled mix in that mood. A slider picks how much comes from your own songs and how much is new to you. Pawse learns each song's era and mood from its release year (asking MusicBrainz in the background, never in incognito), YouTube Music's own mood playlists, the songs you play together, and Last.fm tags once you've connected Last.fm.
- **Smooth shuffle.** A toggle next to Shuffle in the queue and on playlists and albums. Each song stays close to the one before and the mood drifts slowly, so a 90s ballad doesn't jump straight to phonk.
- **YouTube can learn what you like without an account.** Signed out, Pawse keeps one anonymous YouTube profile for this phone, so Home and For you fill with suggestions from the videos you watch here. Turn it off with **Let YouTube learn from what I watch**, or start over with **Reset YouTube recommendations**. Incognito never sends anything.
- **Channel pages like YouTube's.** Home, Videos, Live, Playlists and whatever else the channel has; sort Videos and Live by Latest, Popular or Oldest, search inside the channel, and tap the description for its links, join date, views and country.
- **A video queue.** Press and hold a video for **Play next** or **Add to queue**. Queued videos play before Up next and show in a Queue list on the watch page.
- **A proper settings sheet for videos.** Quality (Auto shows what it's playing, Higher picture quality, Data saver, Advanced), speed with a fine slider, captions with auto-translate, audio track, a sleep timer and Loop, each on its own page.
- **1440p and 4K.** Turn on **Higher qualities (AV1)** if your phone decodes AV1 in hardware (iPhone 15 Pro and newer, recent Android flagships). Computers offer them on their own when they can.
- **Volume and brightness in full screen.** Slide on the right for volume and on the left for brightness; brightness goes back when you leave full screen.
- **Chapters list and pictures while you scrub.** See every chapter with its picture and jump to one, and see the frame you're over while dragging the red bar.
- **Jump to the best part,** and chapters made by SponsorBlock's community for videos that have none.
- **Help SponsorBlock, DeArrow and Return YouTube Dislike.** Your likes and dislikes count on Return YouTube Dislike, and **Help the community** in a video's menu lets you mark a segment, suggest a better title, pick a thumbnail and vote. After a skip, thumbs up or down tell SponsorBlock whether it was right. A random ID made on your phone, no account, never in incognito.
- **Scrobbling to Last.fm and ListenBrainz,** with an offline queue. Videos and incognito are left out.
- **Lyrics in Latin letters.** Tap **Aa** to read Hindi, Marathi, Punjabi, other Indian scripts and Korean in Latin letters, under each line or instead of it.
- **Pick your Dynamic Island:** Mochi on the wire (the new default, riding the progress bar like a headphone cable), Classic, Lyrics (the line being sung), Paw controls or just the time left. Every style glows in the song's colour, shifted by its mood.
- **Mindful mode for videos.** See how long you've watched today and set a daily limit; at the limit the video stops, Mochi falls asleep, and you can take 5 more minutes or call it a day. Music keeps playing.
- **Wake up to a song.** Set a time, the days and what to play; Mochi rings, and the music starts quietly and rises. iOS 26 and Android.
- **Mochi grows with you.** Daily listening streaks, hours and new artists unlock hats, headphone colours and new idle moods in Mochi's wardrobe.
- **An equaliser with AutoEq.** Settings → Playback → Equaliser has presets, ten bands and a preamp. Pick your headphones from AutoEq's open list and Pawse applies the correction made for that model. Long songs on iPhone play without it for now.
- **Crossfeed for headphones,** off until you turn it on, and **Skip silence** at the ends of songs.
- **A visualiser on Now playing** that moves with the music (Show visualiser in the player's menu).
- **Experimental: on-device AI.** Video summaries and Ask this video, AI DJ ("rainy 90s Bollywood but upbeat"), auto chapters for long videos and spotting sponsor reads SponsorBlock doesn't know yet. They run on your phone with Apple Intelligence or Gemini Nano and only show where it's available.

### Changed
- **A new Search.** The search box stays at the top; as you type you get YouTube's suggestions and matching songs, artists and albums with their pictures. Filters for All, Songs, Videos, Albums, Artists, Playlists and Channels each scroll on and on, and All leads with the best match as a big card. Signed in, results and suggestions follow your account.
- **Pull to refresh works everywhere,** keeping what you had until the new page arrives. Home and Videos freshen themselves when you come back after half an hour or the next day.
- **New from your channels is current:** up to 40 channels, newest first, and a channel's dot goes out once you open it or watch the video.
- **For you is more varied:** videos like the ones you watched, your channels' uploads and different topics each time, with no more than a couple from one channel.
- **Watch page:** a description card under the buttons, links that open, "No comments yet" instead of a loading bar, and a fuller description sheet.
- **Smoother player.** Controls fade quicker, the red bar glides, the spinner waits before showing, and the next video is ready before you get to it.
- **Now playing is smoother.** The cover follows your finger with the next one sliding in, and colours fade between songs. Flick the mini player up to open it.
- **Crossfade skips albums.** Songs from the same album, long mixes and live streams play straight into each other (**Gapless albums** in Settings).
- **Original titles and audio:** the title the uploader wrote instead of YouTube's translation, and dubbed videos in their original language.
- **Views read like YouTube's** (1.2M views, not 1200000), and the DeArrow mark no longer looks like the Download button.
- **The Song and Video switch, Show dislikes and Skip non-music parts are regular settings now,** no longer experimental.
- **Better sound where your device can play it:** Android and the computer app play YouTube's Opus audio instead of AAC 128.
- **The sleep timer fades out more gently,** and Mochi curls up as it goes.
- **Pawse now needs Android 8 or newer.**

### Fixed
- **Videos that can't play say why** ("This video is private", "isn't available in your country") with **Next**, and private videos are no longer called age-restricted. Private, deleted, members-only and not-yet-premiered videos are left out of feeds.
- **You can remove songs from playlists again,** by swiping, from the song's menu or with Select songs, in Pawse playlists, YouTube Music playlists and Liked songs, with Undo.
- **The paused video keeps its picture** instead of going black, the controls sit on a much lighter fade, and iOS's Live Text button no longer pops up over a paused frame.
- **Scrolling no longer sets cards bouncing,** and dragging the video down settles without a wobble.
- **The island's cat line no longer gets cut off;** it's an opt-in now.

## [1.12.3] - 2026-10-27

### Fixed
- **Videos play when YouTube asks "Sign in to confirm you're not a bot".** Videos only ever asked YouTube one way, and when YouTube started bot-checking it on your network, every video failed while music kept playing. Videos now ask the same ways music does, starting with the one music gets through with, so they keep playing.

## [1.12.2] - 2026-10-27

### Added
- **Topics on the Videos tab**, like YouTube's chips. Signed in, they're YouTube's own for your account (Music, Gaming, Live and the rest); signed out, Music, Gaming, News, Podcasts, Live, Comedy, Cooking, Sports, Science and Tech, each with the week's popular videos. Every one scrolls on and on.

### Changed
- **For you is new each time you open Pawse.** Signed out, it's built the way YouTube builds it: videos like the ones you watched lately, woven into the popular ones, in a different order each time. Videos you've already watched stay out of it, signed in too. Suggested videos on Home comes from the same feed.
- **Downloads splits Songs from Videos.** Saved videos get their own tab with their picture, length, quality and full size (sound and picture together), and one progress bar each. The top line counts songs and videos apart. Press and hold any row for its menu.
- **Search results have titles.** When you search for music, the best song leads as the top result, then **Songs**, then **Videos**, and the songs keep their place while they load instead of pushing the videos down.

### Fixed
- **Videos play after Pawse has been in the background.** iPhone could close the connection Pawse plays videos through while the app slept, and every video then failed with "Could not connect to the server" until Pawse was restarted. Pawse now checks the connection and opens a new one, and quietly tries the video once more if it still fails.
- **Downloaded videos show their video.** Playing one from Downloads opened the player on the song side, so you only heard it. It now opens on the picture, offline too, even with the player's Video side switched off in Settings. **Retry** in Downloads now retries failed video pictures as well.

## [1.12.1] - 2026-10-26

### Added
- **Your videos stay in step with YouTube.** Signed in, a video you watch in Pawse goes to your YouTube history with your spot, so the YouTube app offers to pick it up where you stopped. Videos you watched in the YouTube app show up in Pawse too, with their red bars and in Continue, whenever you open Pawse.
- **Red bars from your YouTube account on video cards.** Feeds show how far you got in videos you watched anywhere, not just in Pawse.

### Fixed
- **Songs you play reach your YouTube history again.** YouTube had started turning the report away, so plays quietly stopped showing up there.
- Videos you remove from history in Pawse, or a history you clear, stay gone instead of coming back from YouTube.

## [1.12.0] - 2026-10-26

### Added
- **A Videos tab.** YouTube gets its own tab next to Home, with your subscriptions and an endless For you feed, search and pull to refresh. It shows while videos are on.
- **Turn the phone to go full screen**, like YouTube: turn it sideways on a video and it fills the screen; turn it back to leave. The full-screen button and swipe up still work, and iPhone's rotation lock is respected.
- **Up next in 5.** With autoplay on, or in a playlist, the end of a video counts down to the next one with **Cancel** and **Play now**.
- **The title and channel at the top of full screen**, like YouTube.
- **A spinner when the video is waiting** for more after it started (a slow network, a seek, a quality change).
- **The lock screen and Control Center show the video's title, channel and picture.**
- **Captions.** Tap **CC** on the video, or pick a language in the video's settings. Pawse picks captions in your phone's language, and translates when a video has none in it.
- **Change the audio track.** Videos dubbed into other languages now play in their original language, and **Audio track** in the video's settings switches to any other one.
- **Press and hold the video to play at 2×**, like YouTube. Let go and it's back to your speed.
- **Drag comments and the description down to close them**, by the handle at the top.
- **Not interested** and **Don't recommend channel** in every video's ⋯ menu. The video or channel leaves your feeds at once, and signed in, YouTube hears it too.

### Fixed
- **Gestures stay with your finger.** Dragging the video down to the mini player, swiping down out of full screen and scrubbing the seek bar now run on the display thread, so they keep up even while the page is busy. Letting go carries the speed of your swipe.
- **The watch page stopped redrawing itself twice a second** while a video plays, which made scrolling and gestures stutter.
- **The controls fade in the moment you tap**, instead of being rebuilt each time. The seek bar glides instead of jumping, and you feel a tick at each chapter as you scrub.
- **Full screen really is full screen.** The phone now turns to landscape, so iPhone hides the clock, battery and status bar, and the video fills the screen.
- **The seek bar in full screen sits above the bottom edge**, with room to grab it, instead of under the home bar.
- **The arrow at the top of full screen leaves full screen** instead of shrinking the video into the mini player.
- **The next video keeps full screen, your zoom and your speed**, and appears in place instead of the page sliding up again.
- **The mini player stays on the video when the next one starts**, instead of flicking to the song or disappearing for a moment.
- **Playback speed stays as you set it** after seeking or pausing, and carries on to the next video.
- **Seeking a paused video keeps it paused.** Chapters and timestamps in comments and the description still play from there.
- **Keep tapping a side to skip further**: each tap within a second adds 10 seconds.
- **Closing a video keeps your exact spot** for Continue, not the last save a few seconds before.
- **Unsubscribing asks first**, so a stray tap doesn't drop a channel.
- **Listen** carries on from where the video was.
- **When a video won't play, Pawse says why**: age-restricted, private, unavailable, or no connection.
- Pull to refresh on the Videos feed starts it fresh instead of keeping old pages under the new ones.
- **Swipe down in full screen to go back to portrait.** It used to read the swipe sideways, so pulling down did nothing.
- **Pull to refresh shows a spinner** on iPhone, not just a tap of haptics.
- **Home and the other feeds refresh** when you come back to Pawse after a while, instead of showing what was there before.
- **Tap the tab you're on to scroll back to the top**, like YouTube.

## [1.11.1] - 2026-10-25

### Added
- **Incognito.** Turn it on in **Settings → Privacy**, or hold the Settings button on Home. While it's on, nothing you play, watch or search is kept: no listening or watch history, no Continue, no search history, nothing learned for recommendations, and nothing sent to YouTube's history (video searches go out signed out). An **Incognito** chip on Home shows it's on; tap it to turn it off.
- **Resume a playlist where you stopped.** A playlist's page offers **Resume** and says where you stopped, with **Start over** beside it. A music playlist picks up at the song you were on. A YouTube playlist of videos (a course, a series) opens the video you were on at your spot, or the next one if you finished it.
- **Watch a YouTube playlist in order.** Playlists of videos show **Watch** instead of Play, and tapping one opens the watch page with the rest of the list under it ("2 of 13"). Each video plays the next when it ends.
- **YouTube playlists in Search.** The All tab shows playlists and courses beside videos and channels, with how many videos each has.
- **Pin a playlist or album to Home** from its ⋯ menu, or by holding a playlist in Search. It sits in the Pinned row with your pinned videos.
- **A red bar on videos you've watched**, everywhere videos show up: how far you got, or the whole width when you finished it.

### Fixed
- **The Dynamic Island and lock-screen player on iPhone stay with the music.** Opening, closing or switching videos, or the Video side of the player, could make iPhone treat Pawse as background audio and drop them until something else played.
- **Tapping a video shows or hides the controls straight away, anywhere on the picture.** Before, a tap waited to see if a double tap followed, so a quick second tap on a side skipped 10 seconds instead. Double tap now skips only on the left and right thirds.
- **SideStore's What's New shows the release notes** instead of "nil".
- **Pinch to zoom in full screen**, like YouTube: pinch out and the video fills the whole screen, under the notch too; pinch in to see all of it again. Pinching no longer counts as taps that skip the video.
- **Full screen is only the video.** The status bar is hidden and the thin progress line goes away with the controls.
- **Choices in menus are readable on iPhone.** Lists like playback speed and quality showed the unpicked choices in black on the dark menu; they're white now, and the picked one is always bright enough to see.
- **Room between music and videos** in Home's endless feed: a video no longer sits right against the shelf above it.

## [1.11.0] - 2026-10-25

### Added
- **Focus mode** (Settings, or Edit Home). One switch takes away comments, view and like counts, Up next, autoplay and YouTube's suggestions, and Home ends when you're caught up. Each part also has its own switch: hide comments, hide counts, hide Up next, plain thumbnails (a still from the middle of the video instead of the clickbait picture), honest titles, hide search suggestions, and a **break reminder** that pauses the video every 15 to 90 minutes. It replaces the Calm watch page.
- **Full or Focus Home.** Edit Home starts with the two: Full has everything and ends in a feed that keeps going, with YouTube videos between the music; Focus keeps only what you follow, play and pin.
- **Pin to Home.** Pin any video, channel, playlist, album, artist or song from its ⋯ menu, and it sits in a **Pinned** row near the top of Home. Press and hold a pin to move it or unpin it.
- **Subscribe without signing in.** The Subscribe button is on every channel page and watch page. Signed out, your subscriptions live on the phone and fill Your people and New from your channels; signed in, they go to YouTube too.
- **Unsubscribe from Your people.** Press and hold a channel or artist there to open it, pin it or unsubscribe.
- **Channel pages** have a Subscribe button, a ⋯ menu (pin, share, don't show this channel) and pull to refresh.
- **A music mark** (♪) on videos YouTube files as music.
- **Menus for albums, artists and playlists.** Press and hold one to save it, follow, pin it or share it.
- **Remove from history** in a watched video's menu, and the Watched and Liked videos rows open the menu on a long press.
- **Landscape full screen.** Swipe up on a video, or tap the full-screen button, and it turns sideways and fills the screen; swipe down or tap the button again to come back.
- **A small DeArrow mark** (a blue arrow in a circle) next to a video's views when DeArrow changed its title or picture. On the watch page, tap it to see the original title.
- **Try again** on a video that stops playing, which picks up from the same moment. It sits beside **Play the downloaded copy** when you have one.

### Fixed
- **The Video side of the player shows the real music video.** Most YouTube Music songs are audio uploads whose "video" is the album cover. Pawse now finds the song's official music video, and when a song has none, Video is struck through instead of showing a still picture. Watch video in a song's menu opens the music video too.
- **Tapping Home (or Explore, Library) again goes back to the top**, and from the top it refreshes, like YouTube.
- **Pull to refresh shows that it's working** and waits for the new feed.
- **Tapping a playing video shows the controls every time.** Before, taps stopped working after a few seconds until you minimised the video.
- **Opening a video while music plays, then minimising it, no longer closes the video.** The music used to start again by itself and push the video out.
- **The mini player on iPhone** shows one picture instead of two copies fighting over the video.
- **A minimised video stays minimised** when autoplay moves on to the next one.
- **The end card goes away** when you play the video again from the mini player, a chapter or a comment's timestamp.
- **Removing a downloaded video keeps the song** if you downloaded the song too.
- **Pull down on Home** now refreshes the video rows and mixes, not only the YouTube Music picks.
- **Search filters come back** after you tap into the search box and close the keyboard.
- **Comments that fail to load** say so, with a tap to try again, instead of loading forever.
- **The song's lock-screen info on iPhone** is no longer cleared when the Video side opens or closes.
- Minimising a video keeps your exact spot for Continue, and sharing a video on iPhone no longer pastes the link twice.
- The tiny video server on iPhone turns away any connection that isn't from the phone itself.

### Changed
- **Search's All tab searches YouTube**, videos and channels, and loads more as you scroll. When YouTube says the results are music, the matching songs sit on top, ready to play. Songs, Albums, Artists and Playlists still search YouTube Music.
- **Home starts as Full**: Suggested videos and the endless feed are on unless you changed Home before. Choose Focus in Edit Home for a Home that ends.
- **No bar at the top when you scroll** Home, Explore or Library: the page runs to the top of the screen.
- **New icons** throughout, from one set (Lucide), in place of hand-drawn ones.
- **Better menus.** The video menu shows the video on top, with Save, Download and Share, then Listen, Pin to Home, Go to channel and Don't show. Choices like quality, speed and settings lists have a tick on the right instead of a ✓ in the text.
- **Smoother minimise and expand**, with the video easing down and fading into the mini player.
- **The Video side of the player** has rounded corners instead of a hard-edged box.
- **A calmer mini player swipe.** Swiping to skip moves less and settles without the bounce.

## [1.10.0] - 2026-10-25

### Added
- **A new Home.** It opens with **Continue**: the video you were partway through (with how long is left) or the last song, whichever is newer. **Your people** follows: the channels you subscribe to and the artists you follow, with a dot when one has posted in the last two days. Then the latest videos from your channels, Jump back in, your mixes, For you and Liked lately, and Home ends there.
- **Edit Home.** Turn each section on or off and move it up or down (Settings, or the button at the bottom of Home). YouTube's suggestions, the video feed and the YouTube Music picks, are off until you turn them on; with picks on, Home keeps going like before.
- **Videos pick up where you left off.** Open a video you stopped partway and it starts from there.
- **A YouTube filter in Search** for videos and channels from all of YouTube.
- **Comments.** The watch page shows the comment count and the top comment; tap for all of them, with replies, likes and the creator's hearts. Times like 1:23 in a comment jump the video there.
- **Subscribe and like from the watch page** when signed in, with the subscriber count beside the channel.
- **Calm watch page** (Settings): no comments, counts or Up next.
- **YouTube's player controls.** Tap the video for previous, play/pause and next, the time, full screen, an autoplay switch and settings (quality and playback speed). Double-tap either side to skip 10 seconds. Drag the red bar along the bottom to seek, with the time and chapter showing as you go. The controls fade away while the video plays.
- **Download videos** to watch offline, in the quality you pick (with its size). A downloaded video shows up in Downloads, plays without a connection in the player with its picture on the Video side, and the watch page offers the downloaded copy when it can't stream.
- **Save to playlist** from the watch page and from any video's ⋯ menu.
- **Liked videos and Watched** rows in Library.
- The video mini player shows how far through you are.

### Changed
- **The watch page feels like YouTube.** The video stays at the top while the page scrolls under it, the status bar above it is black, and the glow now spreads out below the video instead of above it. The title opens the full description; Up next is full-width videos.
- **Like and dislike work when you're signed out too.** They're kept on the phone, and also go to YouTube when you're signed in. Videos you dislike stop showing up in feeds and Up next.
- **A smaller Song | Video switch** in the player, dark and out of the way, so it no longer sits across faces in the artwork; the top of the artwork is darker behind it.
- **Videos are on for everyone** and no longer under Experimental. The Watch tab is gone: Home and Search cover music and videos, and **All videos** on Home opens the full list of your subscriptions. Settings has a **YouTube videos** switch for music only.
- The Calm / Everything / Only my music choice became Edit Home. Anyone on "Only my music" keeps mixes and For you off.

## [1.9.0] - 2026-10-25

### Fixed
- **Videos play on iPhone.** iPhone's player won't open a playlist saved on the phone, so videos never started. Pawse now hands playlists to the player through a tiny server that only the phone itself can reach.
- **Long songs on iPhone** get the same fix. The faster path for songs over about 10 minutes, from 1.6.0, never actually ran on iPhone; it does now.

### Added
- **Videos keep playing when you leave them, like YouTube.** Drag a video down (or go back) and it shrinks into the mini player above the tabs, still playing. Tap it to grow it back; ✕ closes it. Starting a song closes it too, since only one plays at a time. On computers it floats above the player bar, and Esc shrinks it.
- **The video page loads with its shape already there**: the title and picture from the card you tapped show at once, with placeholders for the rest instead of a black box.
- **Every quality, and Auto.** Videos come in every H.264 quality YouTube has (144p to 1080p60). **Auto** moves between them as your connection allows and shows the one playing (**Auto · 720p60**). Change it on any video with the **Quality** button; the video carries on from the same moment. Set the default in **Experimental → Video quality**.
- **Song | Video switch** in the player for YouTube songs. **Video** shows the song's video in place of the cover, muted and in time with the music; it plays, pauses and seeks with the song. The ⤢ button opens the full video. Turn the switch off in Experimental.
- **Experimental has its own page** in Settings, so Settings stays short.
- **Share** on a video, and a **⋯** menu on every video card.
- Video problems go into **Settings → About → Diagnostics**, so a report says what went wrong.

### Changed
- **Watch looks like YouTube.** No big title or bar at the top: the search box sits under the clock, videos run edge to edge on phones, and computers get a grid.
- **The video page is full screen**, not a card over the page behind it, so there's no gap or rounded edge above the video. It slides up when it opens. The Edge-to-edge setting is gone; this is how it always looks now.
- The video page puts the channel first, then a row of buttons: likes, **Quality**, **Listen** and **Share**.

## [1.8.0] - 2026-10-25

### Added
- **Crossfade.** **Settings → Playback → Crossfade** (3 to 12 seconds) fades a song out over its last seconds and fades the next one in, so songs no longer stop dead. Pawse plays one song at a time, so the two don't overlap; it's a soft hand-off rather than a DJ mix. Off by default, and a song on repeat never fades.
- **Edge-to-edge video (Experimental).** The video fills the top of the screen, like YouTube, with no close arrow above it. Swipe down or go back to close it, or press Esc on computers.
- **Dislikes on videos (Experimental).** **Show dislikes** puts the like and dislike counts under a video, with a bar for the share of likes. Dislike counts are estimates from Return YouTube Dislike.

### Changed
- **The video page glows like YouTube's ambient mode.** A soft, blurred copy of the picture lights the black around the player, then fades to true black, so OLED screens stay dark below it. On computers the glow follows the video as it plays; on phones it comes from the thumbnail.

## [1.7.0] - 2026-10-25

### Added
- **Music videos skip their talking.** Intros, skits and outros in music videos are jumped over, using SponsorBlock's community-marked "non-music" parts. A short note says when it happens. **Settings → Experimental → Skip non-music parts** turns it off.
- **Videos skip sponsor reads**, self-promotion and "like and subscribe" reminders (SponsorBlock). **Skip sponsors** in Experimental turns it off.
- **Honest titles and thumbnails.** Video titles and thumbnails come from DeArrow's community, without the all-caps clickbait and shocked faces, wherever someone has written a better one.
- **Block channels and words.** Long-press a video (or right-click on computers) to block its channel. Add words in **Settings → Experimental → Blocked channels and words** to hide every video with them in the title. Blocked videos stay out of Watch, search and Up next.
- **Song ⇄ Video.** With YouTube videos on, a video button at the top of the player opens the song's video right where the song is, and the music pauses.

### Changed
- Pawse asks SponsorBlock and DeArrow by the first characters of a hash of the video, so they never learn which video you're watching.

## [1.6.0] - 2026-10-25

### Added
- **YouTube videos, without the noise (Experimental).** Turn on **Settings → Experimental → YouTube videos** and a **Watch** tab appears: your subscriptions when you're signed in, a feed when you're not, and video search. Shorts, ads and mixes never show up. Videos play in the phone's own player, with full screen, picture in picture and background play.
- When a video ends, nothing starts by itself: **Replay**, **Next** or **Done**. **Play the next video** in Experimental turns autoplay back on.
- On a video: chapters you can tap to jump to, the description, **Up next**, and **Listen**, which hands the video's sound to Pawse's music player so it plays like a song.
- **Watch video** in a song's menu opens its video when YouTube videos is on.
- Channel pages show a channel's videos, newest first, and never its Shorts.
- **A calmer Home (Experimental).** **Home → Calm** keeps Home to what you play, a few picks and your mixes, and it ends with the cat asleep instead of scrolling forever. **Only my music** shows nothing suggested at all.
- **Search suggestions** have an arrow on the right that puts the words in the search box so you can keep typing. Recent searches show while you type, and each one has its own **×** to remove it.

### Fixed
- **Long songs (over about 11 minutes) play on iPhone, Android and computers.** YouTube slows any single request for more than about 10 MB to the speed of the song itself, and Pawse asked for long songs in one request, so they stalled before starting or partway through. Long songs now play from a playlist of small pieces, which also makes jumping ahead instant. On computers each request asks for at most 10 MB.
- Pulling a page down past the top no longer shows a black band above the colour; the colour carries on up.

## [1.5.1] - 2026-10-17

### Fixed
- **Long songs (from about 20 minutes up to hours) no longer stall before they start on iPhone.** Pawse gave every song 8 seconds to start, but iPhone reads through a long file before playing it. Pawse then gave up, tried YouTube another way and started over, again and again. Long songs now get up to a minute to start and skip Pawse's song cache.
- A long song that's slow to start no longer marks a way of reaching YouTube as bad for your other songs.

## [1.5.0] - 2026-10-17

### Added
- **Pull down on Library to refresh** your YouTube Music likes and playlists. A playlist you make on YouTube also shows up by itself when you open Library or come back to Pawse, instead of hours later.
- **Pull down on a YouTube playlist** to see songs added to it on YouTube.
- More in a Pawse playlist's **⋯** menu:
  - **Rename**
  - **Duplicate**
  - **Delete playlist**
  - **Update from YouTube**, for playlists you brought over from YouTube
- After **Select songs** in your own playlist, a **−** button removes them all at once.
- Tapping the tab you're on scrolls the page back to the top. On Android, it first goes back to the tab's first page.

### Fixed
- A new, empty playlist had no **⋯** menu, so it couldn't be renamed or deleted.
- **Import → A playlist link**: the keyboard no longer covers the link field. **Go** on the keyboard starts the import, and the result shows at the top.
- **Long tracks like hours of white noise or rain no longer keep loading on iPhone.** Pawse tried to download them from the start into its song cache, which is too small for them, so they could stall and jumping ahead barely worked. Tracks that big now stream straight from YouTube and skip the cache. They also no longer download in full when they're up next.

## [1.4.0] - 2026-10-12

### Added
- **Sign in with your browser on computers.** **Use my browser** opens YouTube Music in your browser; sign in there with Firefox and Pawse picks up your account by itself within a few seconds. Google never sees Pawse, so it can't turn it away, and passkeys and 2-step verification work as usual. Pawse finds Firefox, Firefox Developer Edition and Nightly, including Flatpak and Snap installs, and keeps up with Google's refreshes for as long as you stay signed in to Firefox. This follows yt-dlp's `--cookies-from-browser`.
- **Right-click on computers** opens the same menu a long press opens on a phone: songs in lists, song cards on Home and in search, **Jump back in** tiles, and lyrics lines (to share them).
- On computers, queue rows and downloads have a **⋯** button and a right-click menu for what phones do by swiping: **Play now**, **Play next**, **Add to playlist** and **Remove from queue** in the queue; **Play**, **Song options** and **Delete download** in Downloads. On Home and in History, a song's right-click menu has **Remove from Home & history**.

### Fixed
- **"Couldn't sign you in: this browser or app may not be secure"** in Pawse's own Google sign-in window on Mac, Windows and Linux. **Sign in here instead** gets through again.

## [1.3.0] - 2026-10-12

### Added
- **Add to your YouTube Music playlists.** When you're signed in, **Add to playlist** lists your YouTube Music playlists next to your Pawse ones, and the song goes into the playlist on YouTube too. Changes reach YouTube at the same gentle pace as likes.
- **Add many songs at once.** The **⋯** button on any playlist or album adds every song to a playlist, or lets you pick songs with **Select songs**. In the queue, **Save** adds the song playing now and everything up next.
- **Playlist tools.** From a Pawse playlist's **⋯** menu: **Sort** by date added, title, artist or most played (the new order is saved), **Merge another playlist in** (songs already there are skipped, and you can delete the other one afterwards) and **Remove repeats**.
- A short note at the top of the screen tells you where songs went, or that YouTube didn't take them.

### Fixed
- **Add to playlist only offered "New playlist"** when your playlists were all on YouTube Music.
- **Skipping no longer bounces back to the start of the song.** If the next songs can't play, Pawse keeps playing the song you were on and tells you, instead of jumping back to its start.
- One song YouTube won't play no longer makes Pawse stop asking YouTube in that way for every song. A way of asking now only rests after it fails on two different songs.
- When YouTube Music's website or the embedded player says one song is unavailable, Pawse still tries the other ways for that song.

## [1.2.0] - 2026-10-12

### Added
- **More ways to reach YouTube.** Pawse now asks the way YouTube Music's own website does (with a "proof of origin" token from a hidden page), the way YouTube's TV app does, and the way an embedded player does, before falling back to the visionOS ways it used until now. Fewer songs get stuck or skipped.
- **Follows yt-dlp.** The list of ways to ask YouTube and the code that unlocks YouTube's song links come straight from yt-dlp, so when yt-dlp adapts to a YouTube change, Pawse can pick it up quickly. Credits for yt-dlp, NewPipe, Metrolist, BgUtils and others are in NOTICE.md.
- **Songs you've played replay from your phone.** A song in Pawse's cache plays from the phone instead of downloading again, which saves data and keeps YouTube happier.

### Changed
- **When YouTube asks "are you a bot?", Pawse backs off** for 15 minutes (then 30, then 60 if it keeps asking) instead of trying again and again, and plays the song from JioSaavn or your downloads meanwhile.
- A YouTube song that stops partway through picks up where it stopped through another way of asking YouTube; the way that failed rests for 30 minutes.
- If three songs in a row can't start, Pawse stops and tells you instead of skipping through your whole queue.
- Pawse keeps one visitor id instead of looking new to YouTube every time, and fetches only the next song ahead instead of two.

### Fixed
- **Sleep timer: "End of this song" stops the music.** It used to slip to the next song and keep playing. The timed sleep timer now keeps time correctly when the phone sleeps.
- Songs played in data-saver quality no longer go silent halfway while the time keeps running. iPhone read these songs as twice their length.

## [1.1.0] - 2026-10-11

### Added
- **Sign in on Mac, Windows and Linux.** **Continue with Google** opens Google's own sign-in window; once YouTube Music opens there, Pawse brings in your feed, likes and playlists, just like on a phone.
- On computers, your YouTube session is stored encrypted with the system's keychain (Keychain on Mac, Windows' built-in encryption, KWallet or GNOME Keyring on Linux). On a Linux computer without a keyring, you stay signed in until you quit Pawse.

### Changed
- Pawse uses your account more gently. Search, artist and album pages, charts and new releases load signed out, so your account is only used for your feed, library, likes and history.
- Signed-in requests come at a person's pace: a few at once, then about one every 2 seconds.
- Likes, dislikes and follows reach YouTube 2.5 to 4.5 seconds apart, and at most 40 an hour; the rest wait their turn.
- Library sync runs every 6 to 9 hours instead of exactly every 6.
- If YouTube pushes back on your account, Pawse stops using it for 30 minutes and never retries those requests. Music keeps playing, since it always plays signed out.

## [1.0.2] - 2026-10-11

### Added
- **One download for every Mac**: Pawse-mac.dmg runs on Apple silicon and Intel Macs.
- **Windows on ARM**: the same Setup.exe installs the right app on Intel, AMD and Snapdragon PCs.
- **Fedora, RHEL and openSUSE** get an .rpm, and every Linux file now comes for ARM computers too.

### Fixed
- Computer: YouTube songs play again. Pawse asked YouTube over one kind of internet address and fetched the song over another, and YouTube refused it.
- Computer: the visionOS app fallback reaches YouTube instead of failing with "Failed to fetch".
- Linux: the window has Pawse's icon instead of a blank one.
- The welcome screens stay phone-sized on a big window instead of stretching edge to edge.
- Settings → About and the diagnostics log show the computer app's real version.

## [1.0.1] - 2026-10-11

### Fixed
- A fresh install no longer opens on "Something went sideways" (Cannot read properties of undefined). Pawse now starts cleanly before you've played anything.

## [1.0.0] - 2026-10-10

Pawse's first stable release.

### Changed
- The island shows the **time left** by default: a ring in the song's colour that fills as it plays, with the time counting down inside. Pick the cat instead in **Settings → Cat → Bubble shows**.
- The cat's big island player (press and hold) drops play and skip, since iOS's own player has them. Instead: bigger artwork in a glowing ring of the song's colour, the cat or a big time ring, the time bar, and **Like** and **Dislike** around the cat's mood line.
- The Lock Screen card is useful now: the cat's take on the song, **Like** and **Dislike** buttons, and a bar in the song's colour.
- **Settings → Cat → Like and dislike on the island** turns those buttons off.

### Fixed
- A YouTube song that gets stuck before it starts no longer stalls: Pawse checks its link longer on slow connections and moves on to the next way of asking YouTube.

## [0.8.1] - 2026-10-10

### Changed
- Switching songs fades the old one out and the new one in, like Apple Music, instead of cutting off.

### Fixed
- Tapping a song that's still loading no longer leaves the previous song playing under the new title.
- Moving the cat on the progress bar while a song loads no longer snaps back when it starts.
- Songs YouTube refuses get more chances: Pawse also asks the ways NewPipe and Metrolist do, and once more without its saved visitor id, before skipping. The diagnostics log shows what each attempt got.
- iPhone: the Dynamic Island no longer looks doubled. While music plays, iOS shows its own player in the island and Pawse's bubble sits next to it. That bubble now shows the cat or the time left, never a second copy of the artwork. **Settings → Cat → Bubble shows** picks which; "Sound bars" is gone because iOS's player already has them.
- Pawse's island and Lock Screen card use less battery. The cat no longer dances frame by frame in the background; the card only updates when the song changes, you pause, or a mouse visits.

## [0.8.0] - 2026-10-10

### Added
- **Dislike** a song from its menu. Pawse skips it, keeps it out of radio, autoplay, Home and your mixes, and plays less from that artist. If you're signed in, it's sent to YouTube Music too.
- **Song info** in the song menu: title, artists, album, length, IDs and link with copy buttons, and for the playing song the audio format, bitrate, size, where it streams from and the quality in use.
- Long titles slide sideways on Now Playing, the mini player, the desktop player bar and the song menu instead of being cut off.
- Pawse keeps a full **listening journal**: every song, when, how long and from where. Backups carry it, so it survives a reinstall. It's the base for a yearly and monthly Wrapped.
- **Settings → Library → Automatic backup** saves your library to a folder you pick (iCloud Drive, Files or a phone folder) once a day, with a weekly copy kept for 8 weeks.
- **Import → Past listening history** reads your plays from Google Takeout (YouTube Music) and Apple Music's Play Activity file into the journal.

### Changed
- The song menu has a new look: quick Like, Dislike, Download and Share buttons, and icons on every row.
- Settings is shorter and clearer. Related options are merged into one choice each: **Autoplay similar songs** (off, not after albums, or always), **Download automatically** (off, liked songs, or liked and playlist songs) and **Keep played songs offline** (off or a size). Long explanations are gone.
- **Settings → Library** holds **Import music library** (YouTube Music, Apple Music, Google Takeout or a CSV file), **Back up library** and **Restore backup**.

### Fixed
- iPhone: **Update** no longer hangs in SideStore. It opens SideStore, where you refresh **My Apps** and tap **Update** next to Pawse.
- The Dynamic Island's big player (hold the island) fills its space like Apple Music's: bigger artwork, title and artist, a clearer progress bar with larger times, and bigger play, previous and next buttons.

## [0.7.2] - 2026-10-10

### Fixed
- The Dynamic Island is long and roomy like Apple Music's: the artwork sits at the far left and the cat, sound bars or time left at the far right, instead of hugging the camera.

## [0.7.1] - 2026-10-10

### Added
- Pawse picks up where it left off after a call, a video or another app's music, if it was playing before. Turn it off in **Settings → Playback → Resume after other audio**.

### Fixed
- The Dynamic Island follows **Settings → Appearance → Accent colour** when you pick a fixed colour, instead of always taking the artwork's colour.

## [0.7.0] - 2026-10-10

### Important: Pawse is a new app on iPhone and Android
- Pawse now has its own app ID, so this version installs as a **new app next to the old one** instead of updating it. Your library doesn't move by itself:
  1. In the old app, open **Settings → Backup → Export library** and save the file.
  2. Install the new Pawse and choose **Restore a backup** on the first screen (or **Settings → Backup → Import library**).
  3. Check your likes, playlists and stats, then delete the old app.
- The backup holds your likes, playlists, play history (your stats), saved albums, followed artists and settings. Sign in again and download offline songs again. On Mac, Windows and Linux nothing changes.

### Added
- Dynamic Island styles in **Settings → Cat → Dynamic Island style**: the cat with sound bars, sound bars only, or the time left. The island is wider and roomier, like Apple Music's, with a bigger player when you hold it.
- A loading spinner on the play button while a song starts or buffers, and a "connection is slow" note when it takes a while, instead of looking frozen.
- Download settings are in **Settings** now (they were hidden on the Downloads page), plus **Download songs I add to playlists** and an 8 GB option for kept songs.
- **Also after playlists and albums** in Settings → Playback: choose whether similar songs keep playing when a playlist or album ends.
- **Restore a backup** on the first screen, and Settings → Backup shows what your backup holds.

### Changed
- Android has a new bottom bar: the mini player and the tabs sit together in one dock that fades into the page, with Pawse's own icons.
- Playlists and albums now stop at their last song instead of adding similar songs, unless you turn that on.
- "New playlist" asks for a name, instead of naming the playlist after the song.

### Fixed
- Changing songs no longer freezes the app for a moment on slower phones; colours change after the song has started.
- Play/pause in the Dynamic Island no longer flips back or sticks on the wrong icon.
- Downloading a playlist no longer downloads songs again that Pawse already kept offline; they move to Downloads instead.
- Icons that looked off or were missing on some Android phones (back, add, import, checkmarks, arrows) are drawn the same everywhere now.

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

[0.7.3]: https://github.com/thenetaji/pawse-music/releases/tag/v0.7.3
[0.7.2]: https://github.com/thenetaji/pawse-music/releases/tag/v0.7.2
[0.7.1]: https://github.com/thenetaji/pawse-music/releases/tag/v0.7.1
[0.7.0]: https://github.com/thenetaji/pawse-music/releases/tag/v0.7.0
[0.6.0]: https://github.com/thenetaji/pawse-music/releases/tag/v0.6.0
[0.5.0]: https://github.com/thenetaji/pawse-music/releases/tag/v0.5.0
[0.4.0]: https://github.com/thenetaji/pawse-music/releases/tag/v0.4.0
[0.3.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.3.0
[0.2.0]: https://github.com/thenetaji/studio/releases/tag/flow-v0.2.0
[0.1.10]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.10
[0.1.9]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.9
[0.1.8]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.8
[0.1.7]: https://github.com/thenetaji/studio/releases/tag/flow-v0.1.7
