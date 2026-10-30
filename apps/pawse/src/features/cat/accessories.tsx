import { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

// Drawn in Cat's 120 x 120 space; the headband's top edge is at y 28.
export function Hat({ id }: { id: string }) {
  if (id === "beanie")
    return (
      <G>
        <Path d="M37 32 C37 6 83 6 83 32 Z" fill="#E8486A" />
        <Path
          d="M46 27 q1 -10 4 -15 M56 26 q0 -10 1 -16 M66 26 q0 -10 -1 -16 M76 27 q-1 -10 -4 -15"
          stroke="#FF8FA8"
          strokeWidth={1.6}
          strokeLinecap="round"
          fill="none"
          opacity={0.7}
        />
        <Rect x="33" y="26" width="54" height="10" rx="5" fill="#B72C4E" />
        <Path
          d="M40 28 v6 M47 28 v6 M54 28 v6 M61 28 v6 M68 28 v6 M75 28 v6 M82 28 v6"
          stroke="#D9577A"
          strokeWidth={1.3}
          strokeLinecap="round"
        />
        <Circle cx="60" cy="11" r="6.5" fill="#fff" />
        <Circle cx="58" cy="9" r="2" fill="#F3EEF5" />
      </G>
    );
  if (id === "party")
    return (
      <G transform="rotate(-8 60 33)">
        <Path d="M44 34 L60 2 L76 34 Z" fill="#7C6CFF" />
        <Path d="M52 20 L68 28" stroke="#B9B0FF" strokeWidth={2.2} />
        <Circle cx="57" cy="17" r="1.8" fill="#FFE27A" />
        <Circle cx="64" cy="22" r="1.8" fill="#FFE27A" />
        <Circle cx="56" cy="29" r="1.8" fill="#FFE27A" />
        <Ellipse cx="60" cy="34" rx="17" ry="3.4" fill="#FF5A7A" />
        <Circle cx="60" cy="3" r="4" fill="#FFE27A" />
      </G>
    );
  if (id === "crown")
    return (
      <G>
        <Path
          d="M40 34 L37 13 L50 24 L60 9 L70 24 L83 13 L80 34 Z"
          fill="#FFD34D"
          stroke="#D9A021"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
        <Rect x="40" y="29" width="40" height="6" rx="2" fill="#E8B22A" />
        <Circle cx="60" cy="32" r="2.6" fill="#FF4F7B" />
        <Circle cx="48" cy="32" r="1.8" fill="#5BD0FF" />
        <Circle cx="72" cy="32" r="1.8" fill="#5BD0FF" />
        <Circle cx="37" cy="13" r="2.2" fill="#FFF3B0" />
        <Circle cx="83" cy="13" r="2.2" fill="#FFF3B0" />
        <Circle cx="60" cy="9" r="2.4" fill="#FFF3B0" />
      </G>
    );
  return null;
}
