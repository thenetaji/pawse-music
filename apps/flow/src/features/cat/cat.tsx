import { useEffect, useId, useState } from "react";
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
  | "chase";

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
  /** Groove beat; the dance style changes every few bars so it never feels looped. */
  beatMs?: number;
  /** Looking direction for chase/curious, -1..1. */
  look?: number;
};

// Flow's cat. One vector drawing; moods switch eyes, mouth and pose.
export function Cat({
  mood,
  size,
  cups = ["#8B7CFF", "#4B3BD6"],
  color = "orange",
  beatMs = 520,
  look,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const period =
    mood === "groove"
      ? beatMs
      : mood === "happy" || mood === "excited"
        ? 170
        : mood === "purr"
          ? 260
          : mood === "sleep"
            ? 1300
            : mood === "chase"
              ? 120
              : 0;
  const frame = useFrame(period);
  const id = (n: string) => `${n}${uid}`;
  const url = (n: string) => `url(#${id(n)})`;
  const f = FUR[color];
  const dark = color === "black";

  // Dance styles rotate every 8 beats: sway, head-bob, bounce.
  const style = mood === "groove" ? Math.floor(frame / 8) % 3 : 0;
  const odd = frame % 2 === 1;
  let tilt = 0;
  let dy = 0;
  if (mood === "groove") {
    if (style === 0) tilt = odd ? 7 : -7;
    if (style === 1) (dy = odd ? 3 : 0), (tilt = odd ? -3 : 3);
    if (style === 2) dy = odd ? -6 : 0;
  }
  if (mood === "happy" || mood === "excited") dy = odd ? -7 : 0;
  if (mood === "curious") tilt = 9;
  if (mood === "purr") tilt = odd ? 2 : -2;
  if (mood === "chase") (tilt = odd ? -4 : 4), (dy = odd ? -3 : 0);
  if (mood === "yawn") tilt = -4;
  const lookX = look !== undefined ? look * 3 : mood === "curious" ? 3 : 0;

  const eyesClosed = mood === "sleep" || mood === "purr";
  const eyesHappy = mood === "happy" || mood === "excited";
  const eyesSquint = mood === "yawn";
  const mouthOpen = mood === "meow" || mood === "yawn";
  const ink = dark ? "#E9E3DA" : "#3a2416";

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
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
          <Stop offset="0" stopColor={cups[0]} />
          <Stop offset="1" stopColor={cups[1]} />
        </LinearGradient>
        <RadialGradient id={id("eye")} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor={dark ? "#D8F27A" : "#5a3b22"} />
          <Stop offset="1" stopColor={dark ? "#7FA61E" : "#1d120a"} />
        </RadialGradient>
      </Defs>

      <G transform={`translate(0 ${dy}) rotate(${tilt} 60 100)`}>
        <Ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity={0.18} />
        <Path d="M27 52 L24 15 Q25 11 29 13 L55 36 Z" fill={url("fur")} />
        <Path d="M93 52 L96 15 Q95 11 91 13 L65 36 Z" fill={url("fur")} />
        <Path d="M31 44 L29.5 21 L47 37 Z" fill="#F7A9A0" opacity={0.9} />
        <Path d="M89 44 L90.5 21 L73 37 Z" fill="#F7A9A0" opacity={0.9} />
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
        ) : eyesSquint ? (
          <G stroke={ink} strokeWidth={3} strokeLinecap="round" fill="none">
            <Path d="M38 68 l12 3" />
            <Path d="M82 68 l-12 3" />
          </G>
        ) : (
          <G>
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
          </G>
        )}

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
        <Rect x="9" y="55" width="17" height="30" rx="8.5" fill={url("cup")} />
        <Rect x="94" y="55" width="17" height="30" rx="8.5" fill={url("cup")} />
        <Rect
          x="12"
          y="58"
          width="5"
          height="12"
          rx="2.5"
          fill="#fff"
          opacity={0.28}
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
      </G>

      {mood === "groove" && (
        <G transform={odd ? "translate(3 -4)" : undefined}>
          <Path
            d="M104 22 v-13 l9 -2.5 v12"
            stroke="#fff"
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Ellipse cx="101.5" cy="22.5" rx="3.6" ry="2.8" fill="#fff" />
          <Ellipse cx="110.5" cy="19.5" rx="3.6" ry="2.8" fill="#fff" />
        </G>
      )}
      {mood === "sleep" && (
        <G transform={odd ? "translate(2 -3)" : undefined} fill="#fff">
          <SvgText x="98" y="26" fontSize="15" fontWeight="800">
            z
          </SvgText>
          <SvgText x="108" y="14" fontSize="10" fontWeight="800">
            z
          </SvgText>
        </G>
      )}
      {(mood === "happy" || mood === "purr") && (
        <Path
          transform={mood === "purr" && odd ? "translate(1 -2)" : undefined}
          d="M108 20 c-6-4-9-7-9-10.5 0-2.5 2-4.3 4.3-4.3 1.8 0 3.3 1 4.7 2.8 1.4-1.8 2.9-2.8 4.7-2.8 2.3 0 4.3 1.8 4.3 4.3 0 3.5-3 6.5-9 10.5z"
          fill="#FF5A7A"
        />
      )}
      {mood === "excited" && (
        <G fill="#FFE27A" opacity={odd ? 1 : 0.5}>
          <Path d="M104 10 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <Path d="M14 14 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" />
        </G>
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
    </Svg>
  );
}

function useFrame(periodMs: number) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!periodMs) return;
    const t = setInterval(() => setFrame((f) => f + 1), periodMs);
    return () => clearInterval(t);
  }, [periodMs]);
  return frame;
}
