import Svg, { Circle, Path, Rect } from "react-native-svg";

type P = { size?: number; color?: string };

export const HomeIcon = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M11.3 2.7a1.1 1.1 0 0 1 1.4 0l8 6.6c.3.2.4.5.4.9V20a1.5 1.5 0 0 1-1.5 1.5H15v-6.2a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v6.2H4.4A1.5 1.5 0 0 1 2.9 20v-9.8c0-.4.1-.7.4-.9z"
    />
  </Svg>
);

export const ExploreIcon = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="3" width="8" height="8" rx="2.2" fill={color} />
    <Rect x="13" y="3" width="8" height="8" rx="2.2" fill={color} />
    <Rect x="3" y="13" width="8" height="8" rx="2.2" fill={color} />
    <Rect x="13" y="13" width="8" height="8" rx="2.2" fill={color} />
  </Svg>
);

export const SearchIcon = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Circle
      cx="10.5"
      cy="10.5"
      r="6.5"
      stroke={color}
      strokeWidth={2.4}
      fill="none"
    />
    <Path
      d="m15.5 15.5 5 5"
      stroke={color}
      strokeWidth={2.6}
      strokeLinecap="round"
    />
  </Svg>
);

export const LibraryIcon = ({ size = 22, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="3" y="7" width="15" height="14" rx="2.6" fill={color} />
    <Path
      d="M6.5 4h11A2.5 2.5 0 0 1 20 6.5V17"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
);

export const GearIcon = ({ size = 20, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path
      fill={color}
      d="M10.6 2h2.8l.5 2.6 1.6.7 2.2-1.5 2 2-1.5 2.2.7 1.6 2.6.5v2.8l-2.6.5-.7 1.6 1.5 2.2-2 2-2.2-1.5-1.6.7-.5 2.6h-2.8l-.5-2.6-1.6-.7-2.2 1.5-2-2 1.5-2.2-.7-1.6L2 13.4v-2.8l2.6-.5.7-1.6-1.5-2.2 2-2 2.2 1.5 1.6-.7zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"
    />
  </Svg>
);

export const ShuffleIcon = ({ size = 18, color = "#fff" }: P) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8c1.1 1.6 2.3 2.6 4.3 2.6H20M3 17h3.5c1.3 0 2.2-.4 3-1.1M14.2 8.1c.8-.7 1.7-1.1 3-1.1H20"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
    <Path
      d="m17.5 4.5 2.8 2.5-2.8 2.5M17.5 14.5l2.8 2.5-2.8 2.5"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const RepeatIcon = ({
  size = 18,
  color = "#fff",
  one = false,
}: P & { one?: boolean }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
    <Path
      d="m16.5 3.5 2.8 2.5-2.8 2.5M7.5 20.5 4.7 18l2.8-2.5"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {one ? (
      <Path
        d="M11 10.2 12.4 9v6"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : null}
  </Svg>
);
