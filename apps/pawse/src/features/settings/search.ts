import { Platform } from "react-native";

import { PawseAudio } from "../../../modules/pawse-audio";
import { PawseIsland } from "../../../modules/pawse-island-android";
import { appIconsSupported } from "../../lib/app-icon";
import { desktop } from "../../lib/desktop";
import { getSetting } from "../../lib/settings";
import { alarmSupported } from "../alarm/alarm";
import { type GroupId, groupTitle } from "./groups";

type Entry = {
  label: string;
  group: GroupId;
  /** Other words people look for it by. */
  words?: string;
  /** Left out where the row itself isn't shown. */
  when?: boolean;
};

export type Hit = { label: string; group: GroupId };

/** Every row on the group pages, by the label it shows there. */
function index(cat: string): Entry[] {
  const native = Platform.OS !== "web";
  const videos = getSetting("videos", true);
  const audioFx = PawseAudio.available;
  const entries: Entry[] = [
    {
      group: "playback",
      label: "Quality on Wi-Fi",
      words: "audio bitrate streaming",
    },
    {
      group: "playback",
      label: "Quality on mobile data",
      words: "cellular data saver",
    },
    {
      group: "playback",
      label: "Prefer JioSaavn 320 kbps",
      words: "saavn jio",
    },
    {
      group: "playback",
      label: "Same loudness for every song",
      words: "normalise normalize volume level",
    },
    {
      group: "playback",
      label: "Autoplay similar songs",
      words: "radio endless continue",
    },
    { group: "playback", label: "Smooth shuffle", words: "random similar" },
    {
      group: "playback",
      label: "Open on the last song",
      words: "resume restore",
    },
    {
      group: "playback",
      label: "Pause when headphones disconnect",
      words: "bluetooth unplug",
    },
    {
      group: "playback",
      label: "Resume after calls and videos",
      words: "interruption",
      when: native,
    },
    { group: "playback", label: "Sleep timer fade-out", words: "sleep" },
    { group: "playback", label: "Crossfade", words: "fade overlap" },
    { group: "playback", label: "Gapless albums", words: "gap pause" },
    {
      group: "playback",
      label: "Equaliser",
      words: "eq bass treble sound",
      when: audioFx,
    },
    {
      group: "playback",
      label: "Crossfeed for headphones",
      words: "stereo",
      when: audioFx,
    },
    {
      group: "playback",
      label: "Skip silence at song ends",
      words: "trim quiet gaps",
      when: audioFx,
    },
    {
      group: "playback",
      label: "Skip non-music parts",
      words: "sponsorblock talking music video",
    },

    {
      group: "lyrics",
      label: "Lyric line under the title",
      words: "now playing",
    },
    {
      group: "lyrics",
      label: "Text size",
      words: "lyrics font bigger smaller",
    },
    {
      group: "lyrics",
      label: "Lyrics in Latin letters",
      words: "transliteration romanised hindi korean punjabi",
    },

    {
      group: "videos",
      label: "Focus mode",
      words: "calm distraction comments",
    },
    { group: "videos", label: "Edit Home", words: "sections shelves" },
    { group: "videos", label: "YouTube videos", words: "music only shorts" },
    {
      group: "videos",
      label: "Video quality",
      words: "resolution 1080p 4k",
      when: videos,
    },
    {
      group: "videos",
      label: "Higher qualities (AV1)",
      words: "4k 1440p",
      when: videos && native,
    },
    {
      group: "videos",
      label: "Play the next video",
      words: "autoplay",
      when: videos,
    },
    {
      group: "videos",
      label: "Skip sponsors",
      words: "sponsorblock",
      when: videos,
    },
    {
      group: "videos",
      label: "Honest titles and thumbnails",
      words: "dearrow clickbait",
      when: videos,
    },
    {
      group: "videos",
      label: "Song and Video switch",
      words: "player",
      when: videos,
    },
    {
      group: "videos",
      label: "Show dislikes",
      words: "return youtube dislike thumbs",
      when: videos,
    },
    {
      group: "videos",
      label: "Let YouTube learn from what I watch",
      words: "recommendations history",
      when: videos,
    },
    { group: "videos", label: "Reset YouTube recommendations", when: videos },
    {
      group: "videos",
      label: "Blocked channels and words",
      words: "block hide",
      when: videos,
    },
    {
      group: "videos",
      label: "Original titles and audio",
      words: "dubbed translation language",
    },
    {
      group: "videos",
      label: "Best part and community chapters",
      words: "sponsorblock highlight",
    },
    {
      group: "videos",
      label: "Daily video limit",
      words: "mindful mode time watch",
      when: videos,
    },

    {
      group: "look",
      label: "App icon",
      words: "logo",
      when: appIconsSupported,
    },
    { group: "look", label: "Accent colour", words: "color theme" },
    {
      group: "look",
      label: "Now Playing background",
      words: "blur black amoled colour field",
    },
    { group: "look", label: "Reduce motion", words: "animations" },
    { group: "look", label: "Your cat", words: `name colour fur ${cat} mochi` },
    {
      group: "look",
      label: `${cat} on the progress bar`,
      words: "cat mochi wire",
    },
    {
      group: "look",
      label: `${cat} in the Dynamic Island`,
      words: "cat mochi",
    },
    { group: "look", label: "Mouse visits", words: "cat mochi" },
    { group: "look", label: `${cat}'s wardrobe`, words: "cat mochi hat cups" },
    {
      group: "look",
      label: "Island style",
      words: "dynamic island live activity layout",
      when: Platform.OS === "ios",
    },
    {
      group: "look",
      label: "Like and dislike on the island",
      words: "dynamic island",
      when: Platform.OS === "ios",
    },
    {
      group: "look",
      label: `${cat}'s mood line`,
      words: "dynamic island",
      when: Platform.OS === "ios",
    },
    {
      group: "look",
      label: `${cat} pill around the camera`,
      words: "android overlay",
      when: Platform.OS === "android",
    },
    {
      group: "look",
      label: "Pill position",
      words: "android",
      when: Platform.OS === "android",
    },
    {
      group: "look",
      label: "Keep playing in the background",
      words: "battery android",
      when: Platform.OS === "android" && PawseIsland.needsBatteryTip(),
    },

    {
      group: "library",
      label: "Manage downloads",
      words: "offline",
      when: native,
    },
    {
      group: "library",
      label: "Download quality",
      words: "offline",
      when: native,
    },
    {
      group: "library",
      label: "Only on Wi-Fi",
      words: "downloads",
      when: native,
    },
    {
      group: "library",
      label: "Download automatically",
      words: "offline liked",
      when: native,
    },
    {
      group: "library",
      label: "Keep played songs offline",
      words: "cache storage",
      when: native,
    },
    {
      group: "library",
      label: "Clear kept songs",
      words: "cache storage",
      when: native,
    },
    {
      group: "library",
      label: "Import music library",
      words: "spotify playlists",
    },
    { group: "library", label: "Back up library", words: "export backup" },
    {
      group: "library",
      label: "Automatic backup",
      words: "folder daily",
      when: native,
    },
    { group: "library", label: "Restore backup", words: "import" },

    { group: "privacy", label: "Incognito", words: "private history" },
    { group: "privacy", label: "Pause listening history", words: "private" },
    { group: "privacy", label: "Clear search history" },
    { group: "privacy", label: "Clear listening history" },
    {
      group: "privacy",
      label: "Hide explicit songs",
      words: "explicit filter clean",
    },
    { group: "privacy", label: "Region", words: "country content" },
    { group: "privacy", label: "Feed language", words: "content" },
    {
      group: "privacy",
      label: "Help SponsorBlock, DeArrow and Return YouTube Dislike",
      words: "community contribute",
    },

    {
      group: "accounts",
      label: "YouTube Music account",
      words: "sign in out google",
    },
    {
      group: "accounts",
      label: "Sync likes and follows",
      words: "youtube music",
    },
    {
      group: "accounts",
      label: "Add what you play and watch to YouTube history",
      words: "youtube music",
    },
    { group: "accounts", label: "Last.fm", words: "scrobble scrobbling" },
    { group: "accounts", label: "ListenBrainz", words: "scrobble scrobbling" },
    {
      group: "accounts",
      label: "Discord: show what's playing",
      words: "status presence",
      when: !!desktop?.discordActivity,
    },

    {
      group: "alarm",
      label: "Wake up to a song",
      words: "alarm clock morning",
      when: alarmSupported(),
    },

    {
      group: "experimental",
      label: "Summary and Ask this video",
      words: "ai apple intelligence",
    },
    {
      group: "experimental",
      label: "Auto chapters",
      words: "ai apple intelligence",
    },
    {
      group: "experimental",
      label: "Spot sponsors",
      words: "ai apple intelligence",
    },
    {
      group: "experimental",
      label: "AI DJ",
      words: "ai apple intelligence mix",
    },

    { group: "about", label: "About Pawse", words: "version credits licenses" },
    {
      group: "about",
      label: "Check for updates",
      words: "update version",
      when: native,
    },
    { group: "about", label: "Diagnostics", words: "log bug report" },
    { group: "about", label: "Show onboarding again", words: "welcome intro" },
  ];
  return entries.filter((e) => e.when !== false);
}

/** Rows whose label, group name or keywords contain every word typed; label matches first. */
export function searchSettings(query: string, cat: string, ai: boolean): Hit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits: (Hit & { inLabel: boolean })[] = [];
  for (const e of index(cat)) {
    if (e.group === "experimental" && !ai) continue;
    const label = e.label.toLowerCase();
    const all = `${label} ${groupTitle(e.group).toLowerCase()} ${e.words ?? ""}`;
    if (!words.every((w) => all.includes(w))) continue;
    hits.push({
      label: e.label,
      group: e.group,
      inLabel: words.every((w) => label.includes(w)),
    });
  }
  return hits.sort((a, b) => Number(b.inLabel) - Number(a.inLabel));
}
