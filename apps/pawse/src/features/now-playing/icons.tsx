import Airplay from "lucide-react-native/icons/airplay";
import ChevronDownIcon from "lucide-react-native/icons/chevron-down";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import Heart from "lucide-react-native/icons/heart";
import ListMusic from "lucide-react-native/icons/list-music";
import MessageSquareQuote from "lucide-react-native/icons/message-square-quote";
import Svg, { Path, Rect } from "react-native-svg";

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
  <Heart
    size={size}
    color={color}
    strokeWidth={1.9}
    fill={filled ? color : "none"}
  />
);
export const MoreGlyph = ({ size = 22, color = "#fff" }: P) => (
  <Ellipsis size={size} color={color} strokeWidth={2.4} />
);
export const LyricsGlyph = ({ size = 24, color = "#fff" }: P) => (
  <MessageSquareQuote size={size} color={color} strokeWidth={1.8} />
);
export const AirPlayGlyph = ({ size = 24, color = "#fff" }: P) => (
  <Airplay size={size} color={color} strokeWidth={1.8} />
);
export const QueueGlyph = ({ size = 24, color = "#fff" }: P) => (
  <ListMusic size={size} color={color} strokeWidth={1.8} />
);
export const ChevronDown = ({ size = 22, color = "#fff" }: P) => (
  <ChevronDownIcon size={size} color={color} strokeWidth={2.4} />
);
