import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import {
  type LayoutChangeEvent,
  ScrollView,
  type ScrollViewProps,
  StyleSheet,
  View,
} from "react-native";
import { Gesture } from "react-native-gesture-handler";
import {
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

// How far a sheet's scrolling content is from its top; a pull only closes the sheet while that is 0.
const ScrollTop = createContext<SharedValue<number> | null>(null);
export const ScrollTopProvider = ScrollTop.Provider;

const SLOP = 8;
const CLOSE_DISTANCE = 90;
const CLOSE_VELOCITY = 700;

/**
 * Drag the sheet down to close it. Attach `pan` to the sheet (or to its handle) and `style` to the view
 * that moves; lists inside use SheetScrollView so a pull that starts mid-list scrolls instead.
 */
export function usePullToClose(onClose: () => void) {
  const dy = useSharedValue(0);
  const tall = useSharedValue(800);
  const scrollY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  // The pull may begin only once a list has scrolled back to its top, so it counts from there.
  const base = useSharedValue(0);
  const pull = useMemo(() => {
    const away = (v = 0) => {
      "worklet";
      dy.set(
        withTiming(tall.get(), { duration: v > 1500 ? 160 : 220 }, (done) => {
          if (done) scheduleOnRN(onClose);
        }),
      );
    };
    const pan = Gesture.Pan()
      .manualActivation(true)
      .onTouchesDown((e) => {
        const t = e.allTouches[0];
        startX.set(t.absoluteX);
        startY.set(t.absoluteY);
      })
      .onTouchesMove((e, manager) => {
        const t = e.allTouches[0];
        const x = t.absoluteX - startX.get();
        const y = t.absoluteY - startY.get();
        if (Math.abs(x) > 20 || y < -SLOP) manager.fail();
        else if (y > SLOP && scrollY.get() <= 0) manager.activate();
      })
      .onStart((e) => base.set(e.translationY))
      .onUpdate((e) => dy.set(Math.max(0, e.translationY - base.get())))
      .onEnd((e) => {
        if (dy.get() > CLOSE_DISTANCE || e.velocityY > CLOSE_VELOCITY)
          away(e.velocityY);
        else dy.set(withSpring(0, { damping: 24, stiffness: 260 }));
      });
    return { away, pan };
  }, [dy, tall, scrollY, startX, startY, base, onClose]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: dy.get() }],
  }));
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => tall.set(e.nativeEvent.layout.height),
    [tall],
  );
  const reset = useCallback(() => dy.set(0), [dy]);
  return {
    pan: pull.pan,
    /** Slides the sheet away and then calls onClose; for a Close button. */
    close: () => pull.away(),
    style,
    onLayout,
    reset,
    scrollY,
  };
}

export function GrabHandle() {
  return <View style={styles.grab} />;
}

/** A ScrollView that tells the sheet around it when it has been scrolled off the top. */
export function SheetScrollView({
  onScroll,
  onTouchStart,
  ...rest
}: ScrollViewProps) {
  const scrollY = useContext(ScrollTop);
  const at = useRef(0);
  return (
    <ScrollView
      bounces={false}
      scrollEventThrottle={16}
      {...rest}
      onScroll={(e) => {
        at.current = e.nativeEvent.contentOffset.y;
        scrollY?.set(at.current);
        onScroll?.(e);
      }}
      // Several lists can share a sheet; the one being touched is the one that counts.
      onTouchStart={(e) => {
        scrollY?.set(at.current);
        onTouchStart?.(e);
      }}
    />
  );
}

const styles = StyleSheet.create({
  grab: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    marginTop: 7,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
});
