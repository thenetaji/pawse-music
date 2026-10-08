import Svg, { Circle, Path, Rect } from "react-native-svg";

type P = { size?: number; color?: string };

export const PlayGlyph = ({ size = 48, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill={color}
      d="M14 9.6v28.8c0 1.4 1.5 2.2 2.7 1.5l23-14.4a1.75 1.75 0 0 0 0-3L16.7 8.1c-1.2-.7-2.7.1-2.7 1.5z"
    />
  </Svg>
);
export const PauseGlyph = ({ size = 48, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Rect x="11" y="8" width="9" height="32" rx="2.4" fill={color} />
    <Rect x="28" y="8" width="9" height="32" rx="2.4" fill={color} />
  </Svg>
);
export const NextGlyph = ({ size = 40, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill={color}
      d="M26 13.5v21a1.2 1.2 0 0 0 1.9 1L42.7 25a1.2 1.2 0 0 0 0-2L27.9 12.5a1.2 1.2 0 0 0-1.9 1zM5 13.5v21a1.2 1.2 0 0 0 1.9 1L21.7 25a1.2 1.2 0 0 0 0-2L6.9 12.5A1.2 1.2 0 0 0 5 13.5z"
    />
  </Svg>
);
export const PrevGlyph = ({ size = 40, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path
      fill={color}
      d="M22 13.5v21a1.2 1.2 0 0 1-1.9 1L5.3 25a1.2 1.2 0 0 1 0-2l14.8-10.5a1.2 1.2 0 0 1 1.9 1zM43 13.5v21a1.2 1.2 0 0 1-1.9 1L26.3 25a1.2 1.2 0 0 1 0-2l14.8-10.5a1.2 1.2 0 0 1 1.9 1z"
    />
  </Svg>
);
export const HeartGlyph = ({
  size = 22,
  color = "#fff",
  filled = false,
}: P & { filled?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      d="M12 20.5s-7.4-4.5-9.6-9C.8 8.1 2.7 4.5 6.3 4.5c2.1 0 3.6 1.2 4.4 2.5h2.6c.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.5 3.6 3.9 7-2.2 4.5-9.6 9-9.6 9z"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
  </Svg>
);
export const MoreGlyph = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle cx="5" cy="12" r="1.9" fill={color} />
    <Circle cx="12" cy="12" r="1.9" fill={color} />
    <Circle cx="19" cy="12" r="1.9" fill={color} />
  </Svg>
);
export const LyricsGlyph = ({ size = 24, color = "#fff" }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <Path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z" />
    <Path d="M9 8.2v2.6M9 8.2c0-.8.5-1.2 1.2-1.2M14 8.2v2.6M14 8.2c0-.8.5-1.2 1.2-1.2" />
  </Svg>
);
export const AirPlayGlyph = ({ size = 24, color = "#fff" }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinecap="round"
  >
    <Path d="M6.3 17.5a8 8 0 1 1 11.4 0" />
    <Path d="M8.8 15a4.5 4.5 0 1 1 6.4 0" />
    <Path d="M12 15.5l4 5H8z" fill={color} stroke="none" />
  </Svg>
);
export const QueueGlyph = ({ size = 24, color = "#fff" }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={1.8}
    strokeLinecap="round"
  >
    <Path d="M8 6h12M8 12h12M8 18h12" />
    <Circle cx="4" cy="6" r=".7" fill={color} />
    <Circle cx="4" cy="12" r=".7" fill={color} />
    <Circle cx="4" cy="18" r=".7" fill={color} />
  </Svg>
);
export const ChevronDown = ({ size = 22, color = "#fff" }: P) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M6 9.5l6 5.5 6-5.5" />
  </Svg>
);
