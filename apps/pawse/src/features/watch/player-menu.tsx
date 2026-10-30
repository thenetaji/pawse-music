import type { AudioTrackOption, CaptionTrack } from "@pawse/music-core";
import MoonIcon from "lucide-react-native/icons/moon";
import RepeatIcon from "lucide-react-native/icons/repeat";
import UsersIcon from "lucide-react-native/icons/users";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { hideSheet } from "../../components/action-sheet";
import {
  AudioTrackGlyph,
  CaptionsGlyph,
  CheckGlyph,
  ChevronLeft,
  ChevronRight,
  PinGlyph,
  QualityGlyph,
  SpeedGlyph,
} from "../../components/glyphs";
import { showToast } from "../../components/toast";
import { haptic } from "../../lib/haptics";
import { LANGUAGES, languageName } from "../../lib/locale";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import type { Quality, QualityOption } from "../../lib/video-stream";
import { setCaptions, setCaptionsLang } from "./captions";
import { useWatch } from "./store";

export type MenuPage =
  | "main"
  | "quality"
  | "advanced"
  | "speed"
  | "captions"
  | "translate"
  | "audio"
  | "sleep";

export type PlayerMenuProps = {
  /** Where to open; the back arrow still leads to the first page. */
  page?: MenuPage;
  quality: {
    /** "auto", or the key playing. */
    current: string;
    /** What Auto is playing now ("1080p60"). */
    now?: string;
    options: QualityOption[];
  };
  onQuality: (q: Quality) => void;
  onSpeed: (rate: number) => void;
  captions: CaptionTrack[];
  audio?: { tracks: AudioTrackOption[]; current?: string };
  onAudio: (id: string) => void;
  /** Pin the video to Home. */
  pin: { on: boolean; toggle: () => void };
  onCommunity?: () => void;
};

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLOW = 0.25;
const FAST = 2;
const STEP = 0.05;
const SLEEP_MIN = [15, 30, 45, 60];
// "Data saver" plays the tallest quality at or under this.
const SAVER_HEIGHT = 360;
const SLIDE_MS = 240;

const frac = (r: number) => (r - SLOW) / (FAST - SLOW);
const heightOf = (key: string) => parseInt(key, 10) || 0;
const speedText = (r: number) => (r === 1 ? "Normal" : `${r}×`);
const tagOf = (height: number) =>
  height >= 2160 ? "4K" : height >= 1440 ? "2K" : height >= 720 ? "HD" : "";
const base = (l: string) => l.toLowerCase().split("-")[0];

/** YouTube's settings sheet: a list of settings with their values, each opening its own page that slides in. */
export function PlayerMenu(p: PlayerMenuProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // One height for every page, so sliding between them never jumps.
  const tall = Math.max(
    220,
    Math.min(400, height - insets.top - insets.bottom - 170),
  );
  const [stack, setStack] = useState<MenuPage[]>(
    p.page && p.page !== "main" ? ["main", p.page] : ["main"],
  );
  const [w, setW] = useState(0);
  // Which page is in view, counting from the first; the pages sit side by side and this slides along them.
  const at = useSharedValue(stack.length - 1);
  const go = (page: MenuPage) => {
    haptic.light();
    setStack((s) => [...s, page]);
    at.set(withTiming(stack.length, { duration: SLIDE_MS }));
  };
  const back = () => {
    haptic.light();
    const n = stack.length - 1;
    at.set(
      withTiming(n - 1, { duration: SLIDE_MS }, (finished) => {
        if (finished) scheduleOnRN(setStack, stack.slice(0, n));
      }),
    );
  };
  // Choosing something that takes effect (a quality, a language) ends the visit, like YouTube's.
  const done = () => hideSheet();

  const speed = useWatch((s) => s.speed);
  const loop = useWatch((s) => s.loop);
  const sleep = useWatch((s) => s.sleep);
  const on = useSetting("captionsOn", false);
  const lang = useSetting("captionsLang", "") || "en";

  const { quality } = p;
  const best = quality.options[0];
  const mode =
    quality.current === "auto"
      ? "auto"
      : best && quality.current === best.key
        ? "higher"
        : heightOf(quality.current) <= SAVER_HEIGHT
          ? "saver"
          : "advanced";
  const autoText = quality.now ? `Auto (${quality.now})` : "Auto";
  const qualityText =
    mode === "auto"
      ? autoText
      : mode === "higher"
        ? `Higher picture quality (${quality.current})`
        : mode === "saver"
          ? `Data saver (${quality.current})`
          : quality.current;

  // The captions language follows the video's own tracks first, and is translated when there's none.
  const same = p.captions.filter((t) => base(t.lang) === base(lang));
  const own = same.find((t) => !t.auto) ?? same[0];
  const captionText = !on
    ? "Off"
    : own
      ? own.name
      : `${languageName(lang)} (translated)`;
  const sleepText =
    sleep === "end"
      ? "End of video"
      : sleep
        ? `At ${new Date(sleep).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Off";

  const pages: Record<MenuPage, { title: string; body: ReactNode }> = {
    main: {
      title: "Settings",
      body: (
        <>
          <Row
            icon={<QualityGlyph size={22} />}
            label="Quality"
            value={qualityText}
            more
            onPress={() => go("quality")}
          />
          <Row
            icon={<SpeedGlyph size={22} />}
            label="Playback speed"
            value={speedText(speed)}
            more
            onPress={() => go("speed")}
          />
          {p.captions.length ? (
            <Row
              icon={<CaptionsGlyph size={22} />}
              label="Captions"
              value={captionText}
              more
              onPress={() => go("captions")}
            />
          ) : null}
          {p.audio ? (
            <Row
              icon={<AudioTrackGlyph size={22} />}
              label="Audio track"
              value={
                p.audio.tracks.find((t) => t.id === p.audio?.current)?.name ??
                "Original"
              }
              more
              onPress={() => go("audio")}
            />
          ) : null}
          <Row
            icon={<MoonIcon size={22} color="#fff" strokeWidth={2} />}
            label="Sleep timer"
            value={sleepText}
            more
            onPress={() => go("sleep")}
          />
          <Row
            icon={<RepeatIcon size={22} color="#fff" strokeWidth={2} />}
            label="Loop video"
            right={
              <Switch
                value={loop}
                onValueChange={(v) => useWatch.setState({ loop: v })}
                trackColor={{ true: "#fff", false: "rgba(255,255,255,0.3)" }}
                thumbColor={loop ? "#000" : "#fff"}
                accessibilityLabel="Loop video"
              />
            }
            onPress={() => useWatch.setState({ loop: !loop })}
          />
          <Row
            icon={<PinGlyph size={22} />}
            label={p.pin.on ? "Unpin from Home" : "Pin to Home"}
            onPress={() => {
              p.pin.toggle();
              done();
            }}
          />
          {p.onCommunity ? (
            <Row
              icon={<UsersIcon size={22} color="#fff" strokeWidth={2} />}
              label="Help the community"
              sub="SponsorBlock and DeArrow"
              onPress={() => {
                done();
                p.onCommunity?.();
              }}
            />
          ) : null}
        </>
      ),
    },
    quality: {
      title: "Quality",
      body: (
        <>
          <Row
            label={autoText}
            sub="Recommended: follows your connection"
            checked={mode === "auto"}
            onPress={() => {
              p.onQuality("auto");
              done();
            }}
          />
          {best && quality.options.length > 1 ? (
            <>
              <Row
                label="Higher picture quality"
                sub={`Uses more data · ${best.key}`}
                checked={mode === "higher"}
                onPress={() => {
                  p.onQuality(best.key);
                  done();
                }}
              />
              <Row
                label="Data saver"
                sub="Uses less data"
                checked={mode === "saver"}
                onPress={() => {
                  p.onQuality(SAVER_HEIGHT);
                  done();
                }}
              />
            </>
          ) : null}
          <Row
            label="Advanced"
            value={mode === "advanced" ? quality.current : undefined}
            more
            onPress={() => go("advanced")}
          />
        </>
      ),
    },
    advanced: {
      title: "Advanced",
      body: quality.options.map((o) => (
        <Row
          key={o.key}
          label={o.key}
          tag={tagOf(o.height)}
          checked={quality.current === o.key}
          onPress={() => {
            p.onQuality(o.key);
            done();
          }}
        />
      )),
    },
    speed: {
      title: "Playback speed",
      body: <SpeedPage speed={speed} onSpeed={p.onSpeed} />,
    },
    captions: {
      title: "Captions",
      body: (
        <>
          <Row
            label="Off"
            checked={!on}
            onPress={() => {
              setCaptions(false);
              done();
            }}
          />
          {p.captions.map((t) => (
            <Row
              key={t.url}
              label={t.name}
              checked={on && own?.url === t.url}
              onPress={() => {
                setCaptionsLang(t.lang);
                done();
              }}
            />
          ))}
          <Row
            label="Auto-translate"
            value={on && !own ? languageName(lang) : undefined}
            more
            onPress={() => go("translate")}
          />
        </>
      ),
    },
    translate: {
      title: "Auto-translate",
      body: LANGUAGES.map(([code, name]) => (
        <Row
          key={code}
          label={name}
          checked={on && !own && base(lang) === code}
          onPress={() => {
            setCaptionsLang(code);
            done();
          }}
        />
      )),
    },
    audio: {
      title: "Audio track",
      body: (p.audio?.tracks ?? []).map((t) => (
        <Row
          key={t.id}
          label={t.original ? `${t.name} (original)` : t.name}
          checked={t.id === p.audio?.current}
          onPress={() => {
            p.onAudio(t.id);
            done();
          }}
        />
      )),
    },
    sleep: {
      title: "Sleep timer",
      body: (
        <>
          {SLEEP_MIN.map((m) => (
            <Row
              key={m}
              label={`${m} minutes`}
              onPress={() => {
                useWatch.setState({ sleep: Date.now() + m * 60000 });
                showToast(`Pausing in ${m} minutes`);
                done();
              }}
            />
          ))}
          <Row
            label="End of video"
            checked={sleep === "end"}
            onPress={() => {
              useWatch.setState({ sleep: "end" });
              showToast("Pausing at the end of the video");
              done();
            }}
          />
          {sleep ? (
            <Row
              label="Turn off"
              onPress={() => {
                useWatch.setState({ sleep: undefined });
                done();
              }}
            />
          ) : null}
        </>
      ),
    },
  };

  return (
    // The sheet floats in its own window on iOS, outside the app's gesture root, so it brings one.
    <GestureHandlerRootView
      style={{ height: tall, overflow: "hidden" }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      {stack.map((page, i) => (
        <Slide key={`${i}${page}`} i={i} at={at} w={w}>
          {i > 0 ? (
            <Pressable
              onPress={back}
              hitSlop={8}
              accessibilityLabel="Back"
              style={styles.head}
            >
              <ChevronLeft size={22} />
              <Text style={styles.headText}>{pages[page].title}</Text>
            </Pressable>
          ) : (
            <View style={styles.head}>
              <Text style={styles.headText}>{pages[page].title}</Text>
            </View>
          )}
          <ScrollView bounces={false} style={{ flex: 1 }}>
            {pages[page].body}
          </ScrollView>
        </Slide>
      ))}
    </GestureHandlerRootView>
  );
}

/** One page, set beside the others; sliding `at` carries it into view or out. */
function Slide({
  i,
  at,
  w,
  children,
}: {
  i: number;
  at: SharedValue<number>;
  w: number;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (i - at.value) * w }],
  }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="box-none"
    >
      {children}
    </Animated.View>
  );
}

function Row({
  icon,
  label,
  sub,
  value,
  tag,
  right,
  checked,
  more,
  onPress,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  /** The current choice, on the right; a chevron follows when the row opens a page. */
  value?: string;
  tag?: string;
  right?: ReactNode;
  checked?: boolean;
  /** Opens a page: a chevron shows. */
  more?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={
        checked === undefined ? undefined : { selected: checked }
      }
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.lead}>
        {icon ?? (checked ? <CheckGlyph size={20} weight={2.6} /> : null)}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
      {value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {right ??
        (more ? (
          <ChevronRight size={18} color="rgba(255,255,255,0.5)" />
        ) : null)}
    </Pressable>
  );
}

/** Speed as YouTube has it: the value big, a slider in 0.05 steps, and the usual speeds as chips. */
function SpeedPage({
  speed,
  onSpeed,
}: {
  speed: number;
  onSpeed: (rate: number) => void;
}) {
  const [track, setTrack] = useState(0);
  const pos = useSharedValue(frac(speed));
  const held = useSharedValue(false);
  // The thumb follows chips and the finger alike.
  useEffect(() => {
    if (!held.get()) pos.set(withTiming(frac(speed), { duration: 120 }));
  }, [speed, pos, held]);
  const slide = useMemo(() => {
    const set = (f: number) => {
      const r = Math.round((SLOW + f * (FAST - SLOW)) / STEP) * STEP;
      const rate = Math.round(r * 100) / 100;
      if (rate !== useWatch.getState().speed) {
        haptic.tick();
        onSpeed(rate);
      }
    };
    const at = (x: number) => Math.max(0, Math.min(1, track ? x / track : 0));
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .onBegin((e) => {
        held.set(true);
        pos.set(at(e.x));
        set(at(e.x));
      })
      .onUpdate((e) => {
        pos.set(at(e.x));
        set(at(e.x));
      })
      .onFinalize(() => {
        held.set(false);
        pos.set(withTiming(frac(useWatch.getState().speed), { duration: 100 }));
      });
  }, [track, onSpeed, pos, held]);
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: pos.value * track - THUMB / 2 }],
  }));
  const fill = useAnimatedStyle(() => ({ width: pos.value * track }));
  return (
    <View style={styles.speedBody}>
      <Text style={styles.big}>{speed === 1 ? "1×" : `${speed}×`}</Text>
      <GestureDetector gesture={slide}>
        <View
          style={styles.sliderHit}
          onLayout={(e) => setTrack(e.nativeEvent.layout.width)}
        >
          <View style={styles.sliderTrack}>
            <Animated.View style={[styles.sliderFill, fill]} />
          </View>
          <Animated.View style={[styles.thumb, thumb]} />
        </View>
      </GestureDetector>
      <View style={styles.chips}>
        {SPEEDS.map((r) => (
          <Pressable
            key={r}
            onPress={() => {
              haptic.light();
              onSpeed(r);
            }}
            style={[styles.chip, r === speed && styles.chipOn]}
          >
            <Text style={[styles.chipText, r === speed && styles.chipTextOn]}>
              {r === 1 ? "Normal" : `${r}×`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const THUMB = 22;
const HAIR = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    marginBottom: 4,
    borderBottomWidth: HAIR,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headText: { color: "#fff", fontSize: 16, ...display("800") },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
    borderRadius: 12,
  },
  pressed: { backgroundColor: "rgba(255,255,255,0.08)" },
  lead: { width: 24, alignItems: "center" },
  label: { color: "#fff", fontSize: 16, ...display("700") },
  sub: { color: "rgba(255,255,255,0.55)", fontSize: 12.5, marginTop: 1 },
  value: {
    maxWidth: "45%",
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    ...display("700"),
  },
  tag: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)",
    ...display("800"),
  },
  speedBody: { paddingTop: 8, gap: 18 },
  big: {
    color: "#fff",
    fontSize: 40,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
    ...display("800"),
  },
  sliderHit: { height: 36, justifyContent: "center", marginHorizontal: 11 },
  sliderTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  sliderFill: { height: "100%", backgroundColor: "#fff" },
  thumb: {
    position: "absolute",
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: "#fff",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  chipOn: { backgroundColor: "#fff" },
  chipText: { color: "#fff", fontSize: 13.5, ...display("700") },
  chipTextOn: { color: "#000" },
});
