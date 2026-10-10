import Svg, { Path } from "react-native-svg";

// Small stroke icons drawn as vectors: text glyphs like ‹ › ↓ ✓ sit off-centre in some Android fonts.
type P = { size?: number; color?: string; weight?: number };
type F = P & { filled?: boolean };

const Stroke = ({
  d,
  size = 18,
  color = "#fff",
  weight = 2.2,
  filled = false,
}: F & { d: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d={d}
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const ChevronLeft = (p: P) => <Stroke d="M15 5l-7 7 7 7" {...p} />;
export const ChevronRight = (p: P) => <Stroke d="M9 5l7 7-7 7" {...p} />;
export const PlusGlyph = (p: P) => <Stroke d="M12 5v14M5 12h14" {...p} />;
export const MinusGlyph = (p: P) => <Stroke d="M5 12h14" {...p} />;
export const CheckGlyph = (p: P) => <Stroke d="M5 12.5l4.5 4.5L19 7" {...p} />;
export const CloseGlyph = (p: P) => <Stroke d="M6 6l12 12M18 6L6 18" {...p} />;
export const ArrowUp = (p: P) => <Stroke d="M12 19V5M6 11l6-6 6 6" {...p} />;
export const ArrowDown = (p: P) => <Stroke d="M12 5v14M6 13l6 6 6-6" {...p} />;
/** An arrow into a tray: importing. */
export const ImportGlyph = (p: P) => (
  <Stroke d="M12 4v11M7 10l5 5 5-5M5 19h14" {...p} />
);

// Menu icons (song sheet and friends): drawn at 22 px with a lighter stroke.
const CIRCLE = "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z";
export const HeartIcon = (p: F) => (
  <Stroke
    d="M12 20.5s-7.4-4.5-9.6-9C.8 8.1 2.7 4.5 6.3 4.5c2.1 0 3.6 1.2 4.4 2.5h2.6c.8-1.3 2.3-2.5 4.4-2.5 3.6 0 5.5 3.6 3.9 7-2.2 4.5-9.6 9-9.6 9z"
    {...p}
  />
);
export const ThumbsUp = (p: F) => (
  <Stroke
    d="M7 10.5v10M7 10.5l3.6-7.2a2.1 2.1 0 0 1 3.9 1.3L14 9h5a2 2 0 0 1 2 2.3l-1.2 7.5a2 2 0 0 1-2 1.7H7zM7 10.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1H7"
    {...p}
  />
);
export const ThumbsDown = (p: F) => (
  <Stroke
    d="M17 13.5v-10M17 13.5l-3.6 7.2a2.1 2.1 0 0 1-3.9-1.3L10 15H5a2 2 0 0 1-2-2.3l1.2-7.5a2 2 0 0 1 2-1.7H17zM17 13.5h2.5a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H17"
    {...p}
  />
);
/** Arrow into a circle; `done` swaps the arrow for a tick. */
export const DownloadGlyph = ({ done, ...p }: P & { done?: boolean }) => (
  <Stroke
    d={`${CIRCLE}${done ? "M8 12.3l2.8 2.8L16 9.8" : "M12 7.5v8.5M8.5 12.5 12 16l3.5-3.5"}`}
    {...p}
  />
);
export const ShareGlyph = (p: P) => (
  <Stroke
    d="M12 14V3.5M8 7.5l4-4 4 4M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5H16"
    {...p}
  />
);
/** Play next: a cue on the first line. */
export const PlayNextGlyph = (p: P) => (
  <Stroke d="M4 4.5l5 3-5 3zM13 7.5h7M4 14h16M4 19.5h16" {...p} />
);
/** Add to queue (play last): a cue on the last line. */
export const QueueAddGlyph = (p: P) => (
  <Stroke d="M4 4.5h16M4 10h16M4 13.5l5 3-5 3zM13 16.5h7" {...p} />
);
export const PlaylistGlyph = (p: P) => (
  <Stroke d="M4 6h11M4 12h11M4 18h7M18 13v8M14 17h8" {...p} />
);
export const RadioGlyph = (p: P) => (
  <Stroke
    d="M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3zM8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"
    {...p}
  />
);
export const AlbumGlyph = (p: P) => (
  <Stroke d={`${CIRCLE}M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z`} {...p} />
);
export const ArtistGlyph = (p: P) => (
  <Stroke
    d="M12 3.5a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4.5 20.5c.9-3.5 3.9-5.5 7.5-5.5s6.6 2 7.5 5.5"
    {...p}
  />
);
export const InfoGlyph = (p: P) => (
  <Stroke d={`${CIRCLE}M12 11v5.5M12 7.8h.01`} {...p} />
);
/** A picture card: the share card. */
export const CardGlyph = (p: P) => (
  <Stroke
    d="M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM3.5 16l4.5-4.5 4 4 2.5-2.5 6 6M15.5 8h.01"
    {...p}
  />
);
export const TrashGlyph = (p: P) => (
  <Stroke
    d="M4 6.5h16M10 11v6M14 11v6M6 6.5l.9 12.6A1.5 1.5 0 0 0 8.4 20.5h7.2a1.5 1.5 0 0 0 1.5-1.4L18 6.5M9 6.5V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"
    {...p}
  />
);
