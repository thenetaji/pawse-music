import { getProgress } from "@pawse/player";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { type LayoutChangeEvent, Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  type SharedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import {
  CHAIN_MS,
  DOUBLE_MS,
  HOLD_MS,
  pullCloses,
  registerTap,
  seekTarget,
  type TapChain,
  tapZone,
  VOLUME_SPAN,
  volumeAt,
} from "../../lib/cover-gestures";
import { haptic } from "../../lib/haptics";
import { readVolume, setLevel, settleLevel } from "../../lib/screen-levels";
import type { HeartNote, SkipNote } from "./cover-overlays";

// Critically damped (damping = 2 * sqrt(stiffness)), so a skip lands on the next art without overshoot.
export const SETTLE = {
  stiffness: 320,
  damping: 36,
  mass: 1,
  overshootClamping: true,
};
const RUBBER = 0.25;
const HEART_KEEP_MS = 700;
const FADE_DELAY_MS = 600;

type Input = {
  /** Reels skips with an up or down swipe on the cover; otherwise a sideways one. */
  reels: boolean;
  /** The screen's width: how far the cover travels sideways. */
  width: number;
  /** The cover's height: how far it travels up or down, and the volume's slide is a share of it. */
  height: number;
  hasNext: boolean;
  hasPrev: boolean;
  /** Where the cover is along the swipe; the neighbour peeks in beside it. */
  slide: SharedValue<number>;
  landed: SharedValue<number>;
  changed: SharedValue<number>;
  onSkip: (dir: -1 | 1) => void;
  /** A single tap on the cover. */
  onOpen: () => void;
  /** A double tap in the middle. */
  onLike: () => void;
  onSeek: (sec: number) => void;
  onClose?: () => void;
};

// One cover is on screen at a time, so its latest props, width and pending single tap live here, outside render.
let live: Input | undefined;
let boxWidth = 0;
let lone: ReturnType<typeof setTimeout> | undefined;
function later(fn?: () => void, ms = 0) {
  clearTimeout(lone);
  lone = fn ? setTimeout(fn, ms) : undefined;
}

/**
 * Everything a finger can do on the cover and the header above it. The gestures are built once per layout, not
 * per render: one rebuilt while a finger is down loses that touch, and a hold lasts long enough for a render.
 *
 * - quick swipe: skip (sideways, or up and down in Reels, where pulling down on the header closes instead)
 * - press and hold, then slide: the volume
 * - double tap a side: 10 s back or forward, and more for each tap that follows; the middle likes
 * - single tap: `onOpen`, after waiting out a possible second tap
 */
export function useCoverGestures(o: Input) {
  useEffect(() => {
    live = o;
  });
  const { reels, width, height, hasNext, hasPrev, slide, landed, changed } = o;

  const volumeLevel = useSharedValue(0);
  const volumeShown = useSharedValue(0);
  const [skip, setSkip] = useState<SkipNote>();
  const [heart, setHeart] = useState<HeartNote>();
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    boxWidth = e.nativeEvent.layout.width;
  }, []);
  useEffect(() => () => later(), []);
  useEffect(() => {
    if (!skip) return;
    const t = setTimeout(() => setSkip(undefined), CHAIN_MS);
    return () => clearTimeout(t);
  }, [skip]);
  useEffect(() => {
    if (!heart) return;
    const t = setTimeout(() => setHeart(undefined), HEART_KEEP_MS);
    return () => clearTimeout(t);
  }, [heart]);

  const skipTo = useCallback((dir: -1 | 1) => live?.onSkip(dir), []);
  const cover = useMemo(
    () =>
      coverGesture({
        reels,
        width,
        height,
        hasNext,
        hasPrev,
        slide,
        landed,
        changed,
        skipTo,
        volumeLevel,
        volumeShown,
        setSkip,
        setHeart,
      }),
    [
      reels,
      width,
      height,
      hasNext,
      hasPrev,
      slide,
      landed,
      changed,
      skipTo,
      volumeLevel,
      volumeShown,
    ],
  );

  const header = useMemo(() => headerGesture(reels), [reels]);

  return {
    cover,
    header,
    onLayout,
    volume: { level: volumeLevel, shown: volumeShown },
    skip,
    heart,
  };
}

function coverGesture({
  reels,
  width,
  height,
  hasNext,
  hasPrev,
  slide,
  landed,
  changed,
  skipTo,
  volumeLevel,
  volumeShown,
  setSkip,
  setHeart,
}: Pick<
  Input,
  | "reels"
  | "width"
  | "height"
  | "hasNext"
  | "hasPrev"
  | "slide"
  | "landed"
  | "changed"
> & {
  skipTo: (dir: -1 | 1) => void;
  volumeLevel: SharedValue<number>;
  volumeShown: SharedValue<number>;
  setSkip: Dispatch<SetStateAction<SkipNote | undefined>>;
  setHeart: Dispatch<SetStateAction<HeartNote | undefined>>;
}) {
  const swipe = (
    reels
      ? Gesture.Pan().activeOffsetY([-12, 12]).failOffsetX([-14, 14])
      : Gesture.Pan().activeOffsetX([-12, 12]).failOffsetY([-14, 14])
  )
    .onBegin(() => {
      landed.set(0);
      changed.set(0);
    })
    .onUpdate((e) => {
      const d = reels ? e.translationY : e.translationX;
      // Nothing to skip to: the art gives a little, then pulls back.
      const open = d < 0 ? hasNext : hasPrev;
      slide.set(open ? d : d * RUBBER);
    })
    .onEnd((e) => {
      const d = reels ? e.translationY : e.translationX;
      const v = reels ? e.velocityY : e.velocityX;
      const span = reels ? height : width;
      const dir = d < 0 ? -1 : 1;
      const far = Math.abs(d) > span * 0.3 || Math.abs(v) > 700;
      // A flick the other way than the drag doesn't count.
      const agrees = v === 0 || v < 0 === d < 0;
      if (far && agrees && (dir < 0 ? hasNext : hasPrev)) {
        slide.set(
          withSpring(dir * span, { ...SETTLE, velocity: v }, (done) => {
            if (done) landed.set(1);
          }),
        );
        scheduleOnRN(skipTo, dir);
      } else slide.set(withSpring(0, { ...SETTLE, velocity: v }));
    });

  // The pan only starts after the hold and fails on any movement before it, so a swipe never reaches the volume.
  const vol = { on: false, from: 0, base: 0, ready: false };
  const hold = Gesture.Pan()
    .runOnJS(true)
    .enabled(Platform.OS !== "web")
    .maxPointers(1)
    .activateAfterLongPress(HOLD_MS)
    .onStart((e) => {
      vol.on = true;
      vol.ready = false;
      vol.base = e.translationY;
      haptic.tick();
      // The volume is read now, not remembered: the buttons may have moved it.
      void readVolume().then((v) => {
        if (v === undefined || !vol.on) return;
        vol.from = v;
        vol.ready = true;
        volumeLevel.set(v);
        volumeShown.set(withTiming(1, { duration: 120 }));
      });
    })
    .onUpdate((e) => {
      if (!vol.ready) return;
      const v = volumeAt(
        vol.from,
        e.translationY - vol.base,
        height * VOLUME_SPAN,
      );
      setLevel("volume", v);
      volumeLevel.set(v);
    })
    .onFinalize(() => {
      if (!vol.on) return;
      vol.on = false;
      settleLevel("volume");
      volumeShown.set(
        withDelay(FADE_DELAY_MS, withTiming(0, { duration: 260 })),
      );
    });

  // A single tap waits out DOUBLE_MS for a second one; once a double tap has landed, taps add up at once.
  let chain: TapChain | undefined;
  let aim: number | undefined;
  const taps = Gesture.Tap()
    .runOnJS(true)
    .maxDuration(300)
    .onEnd((e, ok) => {
      if (!ok) return;
      const zone = tapZone(e.x, boxWidth);
      const tap = registerTap(chain, zone, Date.now());
      chain = tap.chain;
      later();
      if (tap.kind === "single") {
        later(() => live?.onOpen(), DOUBLE_MS);
        return;
      }
      if (zone === 0) {
        live?.onLike();
        setHeart((h) => ({ n: (h?.n ?? 0) + 1, x: e.x, y: e.y }));
        return;
      }
      const { position, duration } = getProgress();
      aim = seekTarget(
        tap.kind === "again" && aim !== undefined ? aim : position,
        zone,
        duration,
      );
      haptic.light();
      live?.onSeek(aim);
      setSkip((s) => ({
        side: zone,
        n: tap.kind === "again" && s?.side === zone ? s.n + 1 : 1,
      }));
    });

  return Gesture.Exclusive(Gesture.Race(hold, swipe), taps);
}

function headerGesture(reels: boolean) {
  return Gesture.Pan()
    .runOnJS(true)
    .enabled(reels)
    .maxPointers(1)
    .activeOffsetY(12)
    .failOffsetX([-20, 20])
    .failOffsetY(-12)
    .onEnd((e, ok) => {
      if (!ok || !pullCloses(e.translationY, e.velocityY)) return;
      haptic.light();
      live?.onClose?.();
    });
}
