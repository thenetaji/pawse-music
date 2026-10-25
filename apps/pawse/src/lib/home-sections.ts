import { setSetting, useSetting } from "./settings";

export type HomeSectionId =
  | "continue"
  | "pinned"
  | "people"
  | "new"
  | "jump"
  | "mixes"
  | "foryou"
  | "liked"
  | "ytvideos"
  | "picks";

export type HomeSection = { id: HomeSectionId; on: boolean };

/** Every Home section, in the full app's order; Focus mode keeps only what you chose. */
export const HOME_SECTIONS: {
  id: HomeSectionId;
  label: string;
  note: string;
  on: boolean;
  /** Needs YouTube videos turned on. */
  videos?: boolean;
}[] = [
  {
    id: "continue",
    label: "Continue",
    note: "The video or song you left",
    on: true,
  },
  {
    id: "pinned",
    label: "Pinned",
    note: "What you pinned from a ⋯ menu",
    on: true,
  },
  {
    id: "people",
    label: "Your people",
    note: "Channels and artists you follow",
    on: true,
  },
  {
    id: "new",
    label: "New from your channels",
    note: "Latest uploads from channels you subscribe to",
    on: true,
    videos: true,
  },
  {
    id: "jump",
    label: "Jump back in",
    note: "Songs you played lately",
    on: true,
  },
  {
    id: "mixes",
    label: "Your mixes",
    note: "Radios from your top artists",
    on: true,
  },
  {
    id: "foryou",
    label: "For you",
    note: "Picked on this phone from your taste",
    on: true,
  },
  { id: "liked", label: "Liked lately", note: "Your newest likes", on: true },
  {
    id: "ytvideos",
    label: "Suggested videos",
    note: "YouTube's video feed",
    on: true,
    videos: true,
  },
  {
    id: "picks",
    label: "Endless feed",
    note: "YouTube and YouTube Music picks that keep going",
    on: true,
  },
];

const ids = new Set(HOME_SECTIONS.map((s) => s.id));

// The full app: everything, ending in a feed that keeps going.
export const FULL_HOME: HomeSection[] = HOME_SECTIONS.map((d) => ({
  id: d.id,
  on: true,
}));
// Focus: only what you started, follow or pinned; Home ends when you're caught up.
const SUGGESTED = new Set<HomeSectionId>(["foryou", "ytvideos", "picks"]);
export const FOCUS_HOME: HomeSection[] = HOME_SECTIONS.map((d) => ({
  id: d.id,
  on: !SUGGESTED.has(d.id),
}));

/** The saved order and switches, with any section added since appended in its default state. */
export function useHomeSections(): HomeSection[] {
  const saved = useSetting<HomeSection[] | null>("homeSections", null);
  // "Only my music" from before Edit Home also turned off what's picked for you.
  const mine = useSetting<string>("homeStyle", "") === "mine";
  const list = (saved ?? []).filter((s) => ids.has(s.id));
  for (const d of HOME_SECTIONS)
    if (!list.some((s) => s.id === d.id))
      list.push({
        id: d.id,
        on: d.on && !(mine && (d.id === "mixes" || d.id === "foryou")),
      });
  return list;
}

export const setHomeSections = (list: HomeSection[]) =>
  setSetting("homeSections", list);

export const resetHomeSections = () => setSetting("homeSections", null);
