import type { LucideIcon } from "lucide-react-native";
import ArrowDownIcon from "lucide-react-native/icons/arrow-down";
import ArrowUpIcon from "lucide-react-native/icons/arrow-up";
import BellIcon from "lucide-react-native/icons/bell";
import CheckIcon from "lucide-react-native/icons/check";
import ChevronLeftIcon from "lucide-react-native/icons/chevron-left";
import ChevronRightIcon from "lucide-react-native/icons/chevron-right";
import CircleArrowDownIcon from "lucide-react-native/icons/circle-arrow-down";
import CircleCheckIcon from "lucide-react-native/icons/circle-check";
import CircleUserRoundIcon from "lucide-react-native/icons/circle-user-round";
import CopyIcon from "lucide-react-native/icons/copy";
import Disc3Icon from "lucide-react-native/icons/disc-3";
import EyeOffIcon from "lucide-react-native/icons/eye-off";
import GaugeIcon from "lucide-react-native/icons/gauge";
import HeadphonesIcon from "lucide-react-native/icons/headphones";
import LucideHeart from "lucide-react-native/icons/heart";
import HistoryIcon from "lucide-react-native/icons/rotate-ccw-clock";
import ImageIcon from "lucide-react-native/icons/image";
import ImportIcon from "lucide-react-native/icons/import";
import InfoIcon from "lucide-react-native/icons/info";
import LeafIcon from "lucide-react-native/icons/leaf";
import ListEndIcon from "lucide-react-native/icons/list-end";
import ListPlusIcon from "lucide-react-native/icons/list-plus";
import ListStartIcon from "lucide-react-native/icons/list-start";
import MinusIcon from "lucide-react-native/icons/minus";
import Music2Icon from "lucide-react-native/icons/music-2";
import PencilIcon from "lucide-react-native/icons/pencil";
import PinIcon from "lucide-react-native/icons/pin";
import PinOffIcon from "lucide-react-native/icons/pin-off";
import PlusIcon from "lucide-react-native/icons/plus";
import RadioIcon from "lucide-react-native/icons/radio";
import RotateCwIcon from "lucide-react-native/icons/rotate-cw";
import ShareIcon from "lucide-react-native/icons/share";
import SlidersHorizontalIcon from "lucide-react-native/icons/sliders-horizontal";
import ThumbsDownIcon from "lucide-react-native/icons/thumbs-down";
import ThumbsUpIcon from "lucide-react-native/icons/thumbs-up";
import Trash2Icon from "lucide-react-native/icons/trash";
import UserMinusIcon from "lucide-react-native/icons/user-minus";
import UserPlusIcon from "lucide-react-native/icons/user-plus";
import UserRoundIcon from "lucide-react-native/icons/user-round";
import VideoIcon from "lucide-react-native/icons/video";
import VideoOffIcon from "lucide-react-native/icons/video-off";
import XIcon from "lucide-react-native/icons/x";
import Svg, { Path } from "react-native-svg";

// Icons come from Lucide, one consistent set; the names stay so every screen keeps working.
type P = { size?: number; color?: string; weight?: number };
type F = P & { filled?: boolean };

const make = (Icon: LucideIcon) =>
  function Glyph({ size = 18, color = "#fff", weight = 2 }: P) {
    return <Icon size={size} color={color} strokeWidth={weight} />;
  };
const makeFilled = (Icon: LucideIcon) =>
  function Glyph({ size = 18, color = "#fff", weight = 2, filled }: F) {
    return (
      <Icon
        size={size}
        color={color}
        strokeWidth={weight}
        fill={filled ? color : "none"}
      />
    );
  };

export const ChevronLeft = make(ChevronLeftIcon);
export const ChevronRight = make(ChevronRightIcon);
export const PlusGlyph = make(PlusIcon);
export const MinusGlyph = make(MinusIcon);
export const CheckGlyph = make(CheckIcon);
export const PencilGlyph = make(PencilIcon);
export const CopyGlyph = make(CopyIcon);
export const RefreshGlyph = make(RotateCwIcon);
export const CloseGlyph = make(XIcon);
export const ArrowUp = make(ArrowUpIcon);
export const ArrowDown = make(ArrowDownIcon);
export const ImportGlyph = make(ImportIcon);
export const ShareGlyph = make(ShareIcon);
export const PlayNextGlyph = make(ListStartIcon);
export const QueueAddGlyph = make(ListEndIcon);
export const PlaylistGlyph = make(ListPlusIcon);
export const RadioGlyph = make(RadioIcon);
export const AlbumGlyph = make(Disc3Icon);
export const ArtistGlyph = make(UserRoundIcon);
export const InfoGlyph = make(InfoIcon);
export const CardGlyph = make(ImageIcon);
export const TrashGlyph = make(Trash2Icon);
export const PinGlyph = make(PinIcon);
export const UnpinGlyph = make(PinOffIcon);
export const UnsubscribeGlyph = make(UserMinusIcon);
export const SubscribeGlyph = make(UserPlusIcon);
export const HistoryGlyph = make(HistoryIcon);
export const HideGlyph = make(EyeOffIcon);
export const VideoGlyph = make(VideoIcon);
export const NoVideoGlyph = make(VideoOffIcon);
export const MusicGlyph = make(Music2Icon);
export const BellGlyph = make(BellIcon);
export const FocusGlyph = make(LeafIcon);
export const HeadphonesGlyph = make(HeadphonesIcon);
export const QualityGlyph = make(SlidersHorizontalIcon);
export const SpeedGlyph = make(GaugeIcon);
export const ChannelGlyph = make(CircleUserRoundIcon);
export const HeartIcon = makeFilled(LucideHeart);
export const ThumbsUp = makeFilled(ThumbsUpIcon);
export const ThumbsDown = makeFilled(ThumbsDownIcon);
/** Arrow into a circle; `done` swaps it for a tick. */
const Downloaded = make(CircleCheckIcon);
const ToDownload = make(CircleArrowDownIcon);
export const DownloadGlyph = ({ done, ...p }: P & { done?: boolean }) =>
  done ? <Downloaded {...p} /> : <ToDownload {...p} />;

/** Marks a title or thumbnail swapped in from DeArrow. */
export const DeArrowMark = ({ size = 12 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM12 7.5v8M8.5 12.5l3.5 3.5 3.5-3.5"
      stroke="rgba(140,180,255,0.9)"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);
