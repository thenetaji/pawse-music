import type { LucideIcon } from "lucide-react-native";
import AlarmClockIcon from "lucide-react-native/icons/alarm-clock";
import CaptionsIcon from "lucide-react-native/icons/captions";
import CatIcon from "lucide-react-native/icons/cat";
import CircleUserRoundIcon from "lucide-react-native/icons/circle-user-round";
import FlaskConicalIcon from "lucide-react-native/icons/flask-conical";
import InfoIcon from "lucide-react-native/icons/info";
import LibraryIcon from "lucide-react-native/icons/library";
import LockIcon from "lucide-react-native/icons/lock";
import Music2Icon from "lucide-react-native/icons/music-2";
import VideoIcon from "lucide-react-native/icons/video";
import type { Href } from "expo-router";

import { useScrobbleAccounts } from "../../data/scrobbler";
import { useLibrary } from "../../data/library";
import { currentVersion } from "../../lib/updates";
import { autoDownloadMode } from "../../lib/settings";
import { count } from "../../lib/plural";
import { push } from "../../lib/nav";
import { useAlarmSummary } from "../alarm/alarm-settings";

export type GroupId =
  | "playback"
  | "lyrics"
  | "videos"
  | "look"
  | "library"
  | "privacy"
  | "accounts"
  | "alarm"
  | "experimental"
  | "about";

export type Group = {
  id: GroupId;
  title: string;
  Icon: LucideIcon;
  href: string;
};

// Alarm and Experimental open the pages that already existed; the rest live under /settings.
export const GROUPS: Group[] = [
  {
    id: "playback",
    title: "Playback and sound",
    Icon: Music2Icon,
    href: "/settings/playback",
  },
  {
    id: "lyrics",
    title: "Lyrics",
    Icon: CaptionsIcon,
    href: "/settings/lyrics",
  },
  {
    id: "videos",
    title: "Videos and YouTube",
    Icon: VideoIcon,
    href: "/settings/videos",
  },
  {
    id: "look",
    title: "Look and Mochi",
    Icon: CatIcon,
    href: "/settings/look",
  },
  {
    id: "library",
    title: "Library and downloads",
    Icon: LibraryIcon,
    href: "/settings/library",
  },
  {
    id: "privacy",
    title: "Privacy",
    Icon: LockIcon,
    href: "/settings/privacy",
  },
  {
    id: "accounts",
    title: "Connected accounts",
    Icon: CircleUserRoundIcon,
    href: "/settings/accounts",
  },
  { id: "alarm", title: "Alarm", Icon: AlarmClockIcon, href: "/alarm" },
  {
    id: "experimental",
    title: "Experimental",
    Icon: FlaskConicalIcon,
    href: "/experimental",
  },
  {
    id: "about",
    title: "About",
    Icon: InfoIcon,
    href: "/settings/about",
  },
];

export const groupTitle = (id: GroupId) =>
  GROUPS.find((g) => g.id === id)?.title ?? "";

export const openGroup = (id: GroupId) =>
  push((GROUPS.find((g) => g.id === id)?.href ?? "/settings") as Href);

const QUALITY = { high: "High", saver: "Low" } as const;
const SIZE = { s: "Small", m: "Medium", l: "Large" } as const;

/** One line per group saying how it is set now; Alarm is absent where alarms can't ring. */
export function useSummaries(): Partial<Record<GroupId, string>> {
  const s = useLibrary((x) => x.settings) as Record<string, unknown>;
  const liked = useLibrary((x) => x.liked.length);
  const lastfm = useScrobbleAccounts((x) => x.lastfm);
  const listenbrainz = useScrobbleAccounts((x) => x.listenbrainz);
  const alarm = useAlarmSummary();
  const get = <T,>(k: string, def: T): T => (s[k] as T | undefined) ?? def;

  const quality = get<string>("quality", "auto");
  const crossfade = get("crossfade", 0);
  const videos = get("videos", true);
  const connected = [
    s.cookies ? "YouTube Music" : null,
    lastfm ? "Last.fm" : null,
    listenbrainz ? "ListenBrainz" : null,
  ].filter(Boolean);
  const ai = ["aiSummary", "aiChapters", "aiSponsors", "aiDj"].filter((k) =>
    get(k, false),
  ).length;
  const privacy = [
    get("incognito", false) && "Incognito on",
    get("pauseHistory", false) && "History paused",
    get("explicitFilter", false) && "Explicit hidden",
  ].filter(Boolean);

  return {
    playback: [
      QUALITY[quality as keyof typeof QUALITY] ?? "Automatic",
      crossfade ? `Crossfade ${crossfade} s` : "No crossfade",
    ].join(" · "),
    lyrics: [
      get("lyricsLine", true) ? "Line under the title" : "Line off",
      `${SIZE[get<"s" | "m" | "l">("lyricsSize", "m")]} text`,
    ].join(" · "),
    videos: !videos
      ? "Music only"
      : [
          get("focusMode", false) ? "Focus mode" : "Videos on",
          get<string | number>("videoPreferred", "auto") === "auto"
            ? "Auto quality"
            : `${get("videoPreferred", "auto")}p`,
        ].join(" · "),
    look: [
      get("catName", "Mochi"),
      get<string>("accentMode", "artwork") === "fixed"
        ? "Fixed accent"
        : "Accent from artwork",
    ].join(" · "),
    library: [
      count(liked, "like"),
      autoDownloadMode() === "off" ? "No auto-downloads" : "Auto-downloads on",
    ].join(" · "),
    privacy: privacy.length ? privacy.join(" · ") : "Incognito off",
    accounts: connected.length ? connected.join(" · ") : "Not signed in",
    alarm: alarm ?? undefined,
    experimental: ai ? `${ai} on` : "All off",
    about: `Version ${currentVersion()}`,
  };
}
