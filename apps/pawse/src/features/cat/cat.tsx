import { type ReactNode, useEffect, useId } from "react";
import { View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { useSetting } from "../../lib/settings";
import { Hat } from "./accessories";
import { DEFAULT_BEAT_MS } from "./beat";
import { beatFeed, useBeatFeed } from "./beat-feed";
import { findItem } from "./mochi-core";
import {
  calmPose,
  driftAt,
  newRig,
  type Pose,
  type Profile,
  profileFor,
  type RigState,
  stepRig,
} from "./rig";
import {
  bodyMatrix,
  matrixProps,
  rotateAbout,
  scaleAbout,
  turnAndMove,
} from "./svg-matrix";
import { useCatCalm, useCatVisible } from "./use-cat-motion";

export type CatMood =
  | "groove"
  | "sleep"
  | "happy"
  | "curious"
  | "idle"
  | "meow"
  | "purr"
  | "yawn"
  | "excited"
  | "chase"
  // Song moods while playing: fast bounce, eyes-closed sway, heart eyes, a quiet tear.
  | "hype"
  | "vibe"
  | "love"
  | "sad";

export type CatColor = "orange" | "black" | "white" | "grey";

const FUR: Record<
  CatColor,
  { fur: [string, string, string]; stripe: string; muzzle: [string, string] }
> = {
  orange: {
    fur: ["#FFC27A", "#F49A3C", "#D9772A"],
    stripe: "#C9661E",
    muzzle: ["#FFF6EA", "#FBE3C8"],
  },
  black: {
    fur: ["#5A5A66", "#2E2E36", "#1C1C22"],
    stripe: "#141418",
    muzzle: ["#6E6E7A", "#4A4A54"],
  },
  white: {
    fur: ["#FFFFFF", "#F1EEE9", "#D9D4CC"],
    stripe: "#CFC8BD",
    muzzle: ["#FFFFFF", "#F4EFE8"],
  },
  grey: {
    fur: ["#C9CDD6", "#9AA0AD", "#7B8190"],
    stripe: "#6A7080",
    muzzle: ["#F2F3F6", "#DADDE4"],
  },
};

type Props = {
  mood: CatMood;
  size: number;
  /** Headphone colours, usually from the artwork palette. */
  cups?: [string, string];
  color?: CatColor;
  /** Length of a beat while dancing without `live`. */
  beatMs?: number;
  /** Dance to the music: tempo and hop size follow the level meter. */
  live?: boolean;
  /** Looking direction for chase/curious, -1..1. */
  look?: number;
  /** Draws exactly this hat and `cups`, not the ones equipped (Mochi's wardrobe). */
  hat?: string;
};

// Room above the drawing for a hop, so hats and ears aren't cut off at the top of the picture.
const HEADROOM = 12;

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

// Pawse's cat. One vector drawing; moods switch eyes, mouth and pose, and each part moves on the UI thread.
export function Cat({
  mood,
  size,
  cups = ["#8B7CFF", "#4B3BD6"],
  color = "orange",
  beatMs = DEFAULT_BEAT_MS,
  live = false,
  look,
  hat,
}: Props) {
  const equippedHat = useSetting("mochiHat", "none");
  const equippedCups = useSetting("mochiCups", "artwork");
  const hatId = hat ?? equippedHat;
  const cupColors =
    hat === undefined ? (findItem("cups", equippedCups)?.cups ?? cups) : cups;
  const uid = useId().replace(/:/g, "");
  const id = (n: string) => `${n}${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const f = FUR[color];
  const dark = color === "black";

  const visible = useCatVisible();
  const calm = useCatCalm();
  const moving = visible && !calm;
  const dancing = mood === "groove" || mood === "hype";

  const first = profileFor(mood, beatMs, live, 0);
  const profile = useSharedValue<Profile>(first);
  const rig = useSharedValue<RigState>(newRig(calmPose(first)));
  const pose = useSharedValue<Pose>(calmPose(first));
  useEffect(() => {
    const next = profileFor(mood, beatMs, live, Date.now());
    profile.set(next);
    if (calm) pose.set(calmPose(next));
  }, [mood, beatMs, live, calm, profile, pose]);

  const loop = useFrameCallback((frame) => {
    const next = stepRig(
      rig.get(),
      profile.get(),
      {
        beatMs: beatFeed.beatMs.get(),
        amp: beatFeed.amp.get(),
        onsetAt: beatFeed.onsetAt.get(),
        locked: beatFeed.locked.get(),
      },
      frame.timeSincePreviousFrame ?? 16,
      Date.now(),
    );
    rig.set(next);
    pose.set(next.pose);
  }, false);
  useEffect(() => loop.setActive(moving), [moving, loop]);

  const bodyProps = useAnimatedProps(() => matrixProps(bodyMatrix(pose.get())));
  const earLProps = useAnimatedProps(() =>
    matrixProps(rotateAbout(pose.get().earL, 40, 46)),
  );
  const earRProps = useAnimatedProps(() =>
    matrixProps(rotateAbout(pose.get().earR, 80, 46)),
  );
  const cupLProps = useAnimatedProps(() => {
    const c = pose.get().cup;
    return matrixProps(scaleAbout(c, c, 17, 70));
  });
  const cupRProps = useAnimatedProps(() => {
    const c = pose.get().cup;
    return matrixProps(scaleAbout(c, c, 102, 70));
  });
  const eyeProps = useAnimatedProps(() =>
    matrixProps(scaleAbout(1, pose.get().eye, 60, 69)),
  );
  const shadowProps = useAnimatedProps(() => {
    const lift = pose.get().lift;
    return { rx: 30 * (1 - 0.3 * lift), opacity: 0.18 * (1 - 0.45 * lift) };
  });

  // Dance styles are in the rig now; the face only needs to know what the mood looks like.
  const lookX = look !== undefined ? look * 3 : mood === "curious" ? 3 : 0;

  const eyesClosed = mood === "sleep" || mood === "purr" || mood === "vibe";
  const eyesHappy = mood === "happy" || mood === "excited" || mood === "hype";
  const eyesSquint = mood === "yawn";
  const mouthOpen = mood === "meow" || mood === "yawn";
  const ink = dark ? "#E9E3DA" : "#3a2416";
  const noteColor = mood === "sad" ? "#9FD3FF" : "#fff";

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={(size * (120 + HEADROOM)) / 120}
        viewBox={`0 ${-HEADROOM} 120 ${120 + HEADROOM}`}
        style={{ position: "absolute", top: (-size * HEADROOM) / 120 }}
      >
        <Defs>
          <RadialGradient id={id("fur")} cx="45%" cy="38%" r="70%">
            <Stop offset="0" stopColor={f.fur[0]} />
            <Stop offset="0.65" stopColor={f.fur[1]} />
            <Stop offset="1" stopColor={f.fur[2]} />
          </RadialGradient>
          <RadialGradient id={id("muzzle")} cx="50%" cy="40%" r="60%">
            <Stop offset="0" stopColor={f.muzzle[0]} />
            <Stop offset="1" stopColor={f.muzzle[1]} />
          </RadialGradient>
          <LinearGradient id={id("cup")} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={cupColors[0]} />
            <Stop offset="1" stopColor={cupColors[1]} />
          </LinearGradient>
          <RadialGradient id={id("eye")} cx="40%" cy="35%" r="70%">
            <Stop offset="0" stopColor={dark ? "#D8F27A" : "#5a3b22"} />
            <Stop offset="1" stopColor={dark ? "#7FA61E" : "#1d120a"} />
          </RadialGradient>
        </Defs>

        <AnimatedEllipse
          cx="60"
          cy="108"
          rx="30"
          ry="5"
          fill="#000"
          animatedProps={shadowProps}
        />
        <AnimatedG animatedProps={bodyProps}>
          <AnimatedG animatedProps={earLProps}>
            <Path d="M27 52 L24 15 Q25 11 29 13 L55 36 Z" fill={url("fur")} />
            <Path d="M31 44 L29.5 21 L47 37 Z" fill="#F7A9A0" opacity={0.9} />
          </AnimatedG>
          <AnimatedG animatedProps={earRProps}>
            <Path d="M93 52 L96 15 Q95 11 91 13 L65 36 Z" fill={url("fur")} />
            <Path d="M89 44 L90.5 21 L73 37 Z" fill="#F7A9A0" opacity={0.9} />
          </AnimatedG>
          <Ellipse cx="60" cy="68" rx="41" ry="35" fill={url("fur")} />
          <Path
            d="M51 36 q2 7 0 12 M60 34 q1 8 0 14 M69 36 q-2 7 0 12"
            stroke={f.stripe}
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
            opacity={0.75}
          />
          <Path
            d="M20 66 q5 1 9 4 M100 66 q-5 1 -9 4"
            stroke={f.stripe}
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
            opacity={0.6}
          />
          <Ellipse cx="60" cy="84" rx="20" ry="14" fill={url("muzzle")} />
          <Ellipse
            cx="37"
            cy="83"
            rx="7"
            ry="4.5"
            fill="#FF8C8C"
            opacity={eyesHappy || mood === "purr" ? 0.6 : 0.35}
          />
          <Ellipse
            cx="83"
            cy="83"
            rx="7"
            ry="4.5"
            fill="#FF8C8C"
            opacity={eyesHappy || mood === "purr" ? 0.6 : 0.35}
          />

          {eyesClosed ? (
            <G stroke={ink} strokeWidth={2.8} strokeLinecap="round" fill="none">
              <Path d="M37.5 70 q6.5 5 13 0" />
              <Path d="M69.5 70 q6.5 5 13 0" />
            </G>
          ) : eyesHappy ? (
            <G stroke={ink} strokeWidth={3} strokeLinecap="round" fill="none">
              <Path d="M37.5 72 q6.5 -8 13 0" />
              <Path d="M69.5 72 q6.5 -8 13 0" />
            </G>
          ) : mood === "love" ? (
            <G fill="#FF4F7B">
              <Path d={heart(44, 69, 1)} />
              <Path d={heart(76, 69, 1)} />
            </G>
          ) : eyesSquint ? (
            <G stroke={ink} strokeWidth={3} strokeLinecap="round" fill="none">
              <Path d="M38 68 l12 3" />
              <Path d="M82 68 l-12 3" />
            </G>
          ) : (
            <AnimatedG animatedProps={eyeProps}>
              <Ellipse
                cx="44"
                cy="69"
                rx={mood === "chase" ? 7.4 : 6.6}
                ry={mood === "chase" ? 8.8 : 8}
                fill={url("eye")}
              />
              <Ellipse
                cx="76"
                cy="69"
                rx={mood === "chase" ? 7.4 : 6.6}
                ry={mood === "chase" ? 8.8 : 8}
                fill={url("eye")}
              />
              <G transform={`translate(${lookX} 0)`}>
                <Circle cx="46.4" cy="66" r="2.6" fill="#fff" />
                <Circle cx="78.4" cy="66" r="2.6" fill="#fff" />
                <Circle cx="42.6" cy="72.5" r="1.1" fill="#fff" opacity={0.8} />
                <Circle cx="74.6" cy="72.5" r="1.1" fill="#fff" opacity={0.8} />
              </G>
            </AnimatedG>
          )}

          {mood === "sad" ? (
            <G>
              <Path
                d="M37 59 l12 -4 M83 59 l-12 -4"
                stroke={ink}
                strokeWidth={2.6}
                strokeLinecap="round"
              />
              <Path d="M40 79 q-3 5 0 7 q3 -2 0 -7z" fill="#7CC8FF" />
            </G>
          ) : null}
          <Path
            d="M56.5 79.5 h7 q1.2 0 .5 1.1 l-2.8 2.8 q-.7.7-1.4 0 l-2.8-2.8 q-.7-1.1.5-1.1z"
            fill="#F07C86"
          />
          {mouthOpen ? (
            <Ellipse
              cx="60"
              cy={mood === "yawn" ? 90 : 88}
              rx={mood === "yawn" ? 6 : 4.5}
              ry={mood === "yawn" ? 7 : 4.5}
              fill="#7a2a32"
            />
          ) : (
            <Path
              d="M60 84 q-1 4 -5.5 4 M60 84 q1 4 5.5 4"
              stroke="#7a4a32"
              strokeWidth={1.8}
              strokeLinecap="round"
              fill="none"
            />
          )}
          <Path
            d="M40 86 l-17 -2 M40 89.5 l-16 3 M80 86 l17 -2 M80 89.5 l16 3"
            stroke={dark ? "#bbb" : "#fff"}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.8}
          />
          <Path
            d="M19 66 C17 20 103 20 101 66"
            stroke="#2B2B36"
            strokeWidth={6.5}
            fill="none"
            strokeLinecap="round"
          />
          <Path
            d="M22 50 C30 27 90 27 98 50"
            stroke="#fff"
            strokeWidth={1.4}
            fill="none"
            opacity={0.18}
          />
          <AnimatedG animatedProps={cupLProps}>
            <Rect
              x="9"
              y="55"
              width="17"
              height="30"
              rx="8.5"
              fill={url("cup")}
            />
            <Rect
              x="12"
              y="58"
              width="5"
              height="12"
              rx="2.5"
              fill="#fff"
              opacity={0.28}
            />
          </AnimatedG>
          <AnimatedG animatedProps={cupRProps}>
            <Rect
              x="94"
              y="55"
              width="17"
              height="30"
              rx="8.5"
              fill={url("cup")}
            />
            <Rect
              x="97"
              y="58"
              width="5"
              height="12"
              rx="2.5"
              fill="#fff"
              opacity={0.28}
            />
          </AnimatedG>
          <Hat id={hatId} />
        </AnimatedG>

        {dancing &&
          NOTES.map((n, i) => (
            <Drifter key={n.x} pose={pose} i={i} at={n}>
              <Ellipse
                cx="0"
                cy="0"
                rx="3.6"
                ry="2.8"
                fill={i === 1 ? cupColors[0] : "#fff"}
              />
              <Path
                d="M3.2 -.6 V-12 q1 4.6 6 6"
                stroke={i === 1 ? cupColors[0] : "#fff"}
                strokeWidth={2.2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Drifter>
          ))}
        {mood === "sleep" &&
          ZS.map((z, i) => (
            <Drifter key={z.size} pose={pose} i={i} at={z} sleeping>
              <SvgText fill="#fff" fontSize={z.size} fontWeight="800">
                z
              </SvgText>
            </Drifter>
          ))}
        {(mood === "vibe" || mood === "sad") && (
          <Bob pose={pose} dx={3} dy={-4}>
            <Path
              d="M104 22 v-13 l9 -2.5 v12"
              stroke={noteColor}
              strokeWidth={2.4}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Ellipse cx="101.5" cy="22.5" rx="3.6" ry="2.8" fill={noteColor} />
            <Ellipse cx="110.5" cy="19.5" rx="3.6" ry="2.8" fill={noteColor} />
          </Bob>
        )}
        {mood === "love" && (
          <Bob pose={pose} dx={2} dy={-4}>
            <Path d={heart(106, 14, 0.9)} fill="#FF5A7A" />
          </Bob>
        )}
        {mood === "purr" && (
          <Bob pose={pose} dx={1} dy={-2}>
            <Path d={HEART_ABOVE} fill="#FF5A7A" />
          </Bob>
        )}
        {mood === "happy" && <Path d={HEART_ABOVE} fill="#FF5A7A" />}
        {(mood === "excited" || mood === "hype") && (
          <Twinkle pose={pose}>
            <Path d="M104 10 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
            <Path d="M14 14 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" />
          </Twinkle>
        )}
        {mood === "meow" && (
          <SvgText x="92" y="20" fill="#fff" fontSize="13" fontWeight="800">
            mrrp
          </SvgText>
        )}
        {mood === "chase" && (
          <Path
            d="M2 70 h12 M0 80 h10 M4 90 h9"
            stroke="#fff"
            strokeWidth={2.4}
            strokeLinecap="round"
            opacity={0.6}
          />
        )}
        {live && dancing && moving ? <BeatListener /> : null}
      </Svg>
    </View>
  );
}

// Where the floating notes start, and the Zs.
const NOTES = [
  { x: 100, y: 38 },
  { x: 14, y: 38 },
  { x: 82, y: 26 },
];
const ZS = [
  { x: 92, y: 34, size: 10 },
  { x: 92, y: 34, size: 13 },
  { x: 92, y: 34, size: 16 },
];
const HEART_ABOVE =
  "M108 20 c-6-4-9-7-9-10.5 0-2.5 2-4.3 4.3-4.3 1.8 0 3.3 1 4.7 2.8 1.4-1.8 2.9-2.8 4.7-2.8 2.3 0 4.3 1.8 4.3 4.3 0 3.5-3 6.5-9 10.5z";

// A note or a Z rising from its start, turning a little, and fading out.
function Drifter({
  pose,
  i,
  at,
  sleeping = false,
  children,
}: {
  pose: SharedValue<Pose>;
  i: number;
  at: { x: number; y: number };
  sleeping?: boolean;
  children: ReactNode;
}) {
  const props = useAnimatedProps(() => {
    const d = driftAt(pose.get().nt, i, sleeping);
    if (sleeping)
      return {
        ...matrixProps(turnAndMove(0, 11 * d, -31 * d)),
        opacity: d < 0.15 ? (d / 0.15) * 0.9 : (0.9 * (1 - d)) / 0.85,
      };
    return {
      ...matrixProps(turnAndMove(-10 + 22 * d, 5 * d, 10 - 36 * d)),
      opacity: d < 0.2 ? d / 0.2 : (1 - d) / 0.8,
    };
  });
  return (
    <G transform={`translate(${at.x} ${at.y})`}>
      <AnimatedG animatedProps={props}>{children}</AnimatedG>
    </G>
  );
}

// A small decoration that moves up and aside with the mood's pulse.
function Bob({
  pose,
  dx,
  dy,
  children,
}: {
  pose: SharedValue<Pose>;
  dx: number;
  dy: number;
  children: ReactNode;
}) {
  const props = useAnimatedProps(() => {
    const w = pose.get().w;
    return matrixProps(turnAndMove(0, dx * w, dy * w));
  });
  return <AnimatedG animatedProps={props}>{children}</AnimatedG>;
}

function Twinkle({
  pose,
  children,
}: {
  pose: SharedValue<Pose>;
  children: ReactNode;
}) {
  const props = useAnimatedProps(() => ({ opacity: 0.5 + 0.5 * pose.get().w }));
  return (
    <AnimatedG animatedProps={props} fill="#FFE27A">
      {children}
    </AnimatedG>
  );
}

function BeatListener() {
  useBeatFeed(true);
  return null;
}

// A heart centred on (cx, cy), about 14 units wide at scale 1.
function heart(cx: number, cy: number, k: number) {
  const p = (x: number, y: number) => `${cx + x * k} ${cy + y * k}`;
  return `M${p(0, 6)} C${p(-9, 0)} ${p(-7, -8)} ${p(0, -3.5)} C${p(7, -8)} ${p(9, 0)} ${p(0, 6)}Z`;
}
