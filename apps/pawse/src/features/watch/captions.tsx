import { fetchCaptions } from "@pawse/innertube";
import type { CaptionCue, CaptionTrack } from "@pawse/music-core";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLanguage } from "../../lib/locale";
import { appFetch } from "../../lib/net";
import { getSetting, setSetting, useSetting } from "../../lib/settings";

/** What's shown: one of the video's tracks, or one turned into your language by YouTube. */
export type CaptionChoice = { track: CaptionTrack; translate?: string };

// The uploader's captions beat speech recognition in the same language.
function pick(tracks: CaptionTrack[], lang: string): CaptionChoice | undefined {
  const base = (l: string) => l.toLowerCase().split("-")[0];
  const same = tracks.filter((t) => base(t.lang) === base(lang));
  const own = same.find((t) => !t.auto) ?? same[0];
  if (own) return { track: own };
  // None in that language: YouTube translates the uploader's (or the spoken) track.
  const from = tracks.find((t) => !t.auto) ?? tracks[0];
  return from ? { track: from, translate: lang } : undefined;
}

/** Captions for a video: on or off and the language are remembered from video to video, like YouTube. */
export function useCaptions(tracks: CaptionTrack[] | undefined) {
  const on = useSetting("captionsOn", false);
  const phone = useLanguage();
  const lang = useSetting("captionsLang", "") || phone || "en";
  const list = tracks ?? [];
  const choice = on && list.length ? pick(list, lang) : undefined;
  const key = choice ? `${choice.track.url}|${choice.translate ?? ""}` : "";
  const [loaded, setLoaded] = useState<{ key: string; cues: CaptionCue[] }>();
  useEffect(() => {
    if (!choice) return;
    let live = true;
    fetchCaptions(choice.track, {
      fetch: appFetch,
      translate: choice.translate,
    })
      .then((cues) => live && setLoaded({ key, cues }))
      .catch(() => live && setLoaded({ key, cues: [] }));
    return () => {
      live = false;
    };
    // The key names the track and language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    /** Undefined when the video has no captions at all. */
    available: list.length > 0,
    on,
    choice,
    cues: loaded?.key === key ? loaded.cues : undefined,
    tracks: list,
    lang,
  };
}

export const setCaptions = (on: boolean) => setSetting("captionsOn", on);
/** Choosing a language turns captions on in it. */
export const setCaptionsLang = (lang: string) => {
  setSetting("captionsLang", lang);
  setSetting("captionsOn", true);
};
export const captionsOn = () => getSetting("captionsOn", false);

// Captions follow the picture closer than the page's half-second clock.
const TICK_MS = 150;

function cueAt(cues: CaptionCue[], t: number): string {
  let lo = 0;
  let hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = cues[mid];
    if (t < c.start) hi = mid - 1;
    else if (t >= c.end) lo = mid + 1;
    else return c.text;
  }
  return "";
}

/** The current line over the bottom of the video; it rises above the seek bar while the controls show. */
export function CaptionOverlay({
  cues,
  time,
  raised,
  large,
}: {
  cues: CaptionCue[];
  time: () => number;
  raised: boolean;
  large: boolean;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      const next = cueAt(cues, time());
      setText((was) => (was === next ? was : next));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [cues, time]);
  if (!text) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        { bottom: raised ? (large ? 92 : 56) : large ? 28 : 12 },
      ]}
    >
      <Text style={[styles.line, large && styles.large]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above the controls' dimming, so the line stays bright while they show.
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 5,
  },
  line: {
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.75)",
    fontWeight: "600",
  },
  large: { fontSize: 19, lineHeight: 25 },
});
