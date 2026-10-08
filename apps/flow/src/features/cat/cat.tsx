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

export type CatMood = "groove" | "sleep" | "happy" | "curious" | "idle";

type Props = {
  mood: CatMood;
  size: number;
  /** Headphone colours, usually from the artwork palette. */
  cups?: [string, string];
  /** Frame period while grooving; the island uses the same steps. */
  beatMs?: number;
};

// Flow's cat. Moves in discrete frames (like a Live Activity can), never tweens.
export function Cat({
  mood,
  size,
  cups = ["#8B7CFF", "#4B3BD6"],
  beatMs = 520,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const frame = useFrame(
    mood === "groove" || mood === "happy" || mood === "sleep"
      ? mood === "happy"
        ? 180
        : mood === "sleep"
          ? 1300
          : beatMs
      : 0,
  );
  const id = (n: string) => `${n}${uid}`;
  const url = (n: string) => `url(#${id(n)})`;

  const tilt =
    mood === "groove" ? (frame % 2 ? 7 : -7) : mood === "curious" ? 9 : 0;
  const hop = mood === "happy" && frame % 2 ? -7 : 0;
  const look = mood === "curious" ? 3 : 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Defs>
        <RadialGradient id={id("fur")} cx="45%" cy="38%" r="70%">
          <Stop offset="0" stopColor="#FFC27A" />
          <Stop offset="0.65" stopColor="#F49A3C" />
          <Stop offset="1" stopColor="#D9772A" />
        </RadialGradient>
        <RadialGradient id={id("muzzle")} cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#FFF6EA" />
          <Stop offset="1" stopColor="#FBE3C8" />
        </RadialGradient>
        <LinearGradient id={id("cup")} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={cups[0]} />
          <Stop offset="1" stopColor={cups[1]} />
        </LinearGradient>
        <RadialGradient id={id("eye")} cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#5a3b22" />
          <Stop offset="1" stopColor="#1d120a" />
        </RadialGradient>
      </Defs>

      <G transform={`translate(0 ${hop}) rotate(${tilt} 60 100)`}>
        <Ellipse cx="60" cy="108" rx="30" ry="5" fill="#000" opacity={0.18} />
        <Path d="M27 52 L24 15 Q25 11 29 13 L55 36 Z" fill={url("fur")} />
        <Path d="M93 52 L96 15 Q95 11 91 13 L65 36 Z" fill={url("fur")} />
        <Path d="M31 44 L29.5 21 L47 37 Z" fill="#F7A9A0" opacity={0.9} />
        <Path d="M89 44 L90.5 21 L73 37 Z" fill="#F7A9A0" opacity={0.9} />
        <Ellipse cx="60" cy="68" rx="41" ry="35" fill={url("fur")} />
        <Path
          d="M51 36 q2 7 0 12 M60 34 q1 8 0 14 M69 36 q-2 7 0 12"
          stroke="#C9661E"
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
          opacity={0.75}
        />
        <Path
          d="M20 66 q5 1 9 4 M100 66 q-5 1 -9 4"
          stroke="#C9661E"
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
          opacity={mood === "happy" ? 0.6 : 0.35}
        />
        <Ellipse
          cx="83"
          cy="83"
          rx="7"
          ry="4.5"
          fill="#FF8C8C"
          opacity={mood === "happy" ? 0.6 : 0.35}
        />

        {mood === "sleep" ? (
          <G
            stroke="#3a2416"
            strokeWidth={2.8}
            strokeLinecap="round"
            fill="none"
          >
            <Path d="M37.5 70 q6.5 5 13 0" />
            <Path d="M69.5 70 q6.5 5 13 0" />
          </G>
        ) : mood === "happy" ? (
          <G stroke="#3a2416" strokeWidth={3} strokeLinecap="round" fill="none">
            <Path d="M37.5 72 q6.5 -8 13 0" />
            <Path d="M69.5 72 q6.5 -8 13 0" />
          </G>
        ) : (
          <G>
            <Ellipse cx="44" cy="69" rx="6.6" ry="8" fill={url("eye")} />
            <Ellipse cx="76" cy="69" rx="6.6" ry="8" fill={url("eye")} />
            <G transform={`translate(${look} 0)`}>
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
        <Path
          d="M60 84 q-1 4 -5.5 4 M60 84 q1 4 5.5 4"
          stroke="#7a4a32"
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
        <Path
          d="M40 86 l-17 -2 M40 89.5 l-16 3 M80 86 l17 -2 M80 89.5 l16 3"
          stroke="#fff"
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
        <G transform={frame % 2 ? "translate(3 -4)" : undefined}>
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
        <G transform={frame % 2 ? "translate(2 -3)" : undefined} fill="#fff">
          <SvgText x="98" y="26" fontSize="15" fontWeight="800">
            z
          </SvgText>
          <SvgText x="108" y="14" fontSize="10" fontWeight="800">
            z
          </SvgText>
        </G>
      )}
      {mood === "happy" && (
        <Path
          d="M108 20 c-6-4-9-7-9-10.5 0-2.5 2-4.3 4.3-4.3 1.8 0 3.3 1 4.7 2.8 1.4-1.8 2.9-2.8 4.7-2.8 2.3 0 4.3 1.8 4.3 4.3 0 3.5-3 6.5-9 10.5z"
          fill="#FF5A7A"
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
