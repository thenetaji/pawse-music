import Svg, { Circle, Ellipse, Path } from "react-native-svg";

// The cat's nemesis: a small grey mouse in the same soft vector style.
export function Mouse({
  size,
  frame = 0,
  flip,
  carrying,
}: {
  size: number;
  frame?: number;
  flip?: boolean;
  carrying?: "note" | "cable";
}) {
  const step = frame % 2 === 1;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 80 60"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Path
        d={step ? "M8 40 q-8 -2 -6 -12" : "M8 40 q-10 4 -6 -8"}
        stroke="#B9AFB8"
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
      <Ellipse cx="34" cy="40" rx="24" ry="14" fill="#A7A1AC" />
      <Ellipse cx="34" cy="44" rx="18" ry="8" fill="#C7C2CC" />
      <Circle cx="54" cy="30" r="13" fill="#B3ADB8" />
      <Circle cx="50" cy="19" r="8" fill="#B3ADB8" />
      <Circle cx="50" cy="19" r="5" fill="#F4A9B8" />
      <Circle cx="62" cy="21" r="6.5" fill="#B3ADB8" />
      <Circle cx="62" cy="21" r="4" fill="#F4A9B8" />
      <Circle cx="60" cy="30" r="2.4" fill="#1d1418" />
      <Circle cx="60.8" cy="29.2" r="0.8" fill="#fff" />
      <Circle cx="67" cy="34" r="2.6" fill="#F07C96" />
      <Path
        d="M64 36 l10 -2 M64 37 l10 2"
        stroke="#fff"
        strokeWidth={0.9}
        opacity={0.8}
      />
      <Path
        d={step ? "M24 52 l-3 5 M42 52 l3 5" : "M24 52 l2 5 M42 52 l-2 5"}
        stroke="#8F8894"
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      {carrying === "note" && (
        <Path
          d="M66 14 v-10 l7 -2 v9 M66 14 a3 2.4 0 1 1 -0.1 0 M73 11 a3 2.4 0 1 1 -0.1 0"
          stroke="#fff"
          strokeWidth={2}
          fill="#fff"
        />
      )}
      {carrying === "cable" && (
        <Path
          d="M70 36 q8 0 10 -6"
          stroke="#2B2B36"
          strokeWidth={2.6}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
