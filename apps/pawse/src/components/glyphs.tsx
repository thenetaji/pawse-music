import Svg, { Path } from "react-native-svg";

// Small stroke icons drawn as vectors: text glyphs like ‹ › ↓ ✓ sit off-centre in some Android fonts.
type P = { size?: number; color?: string; weight?: number };

const Stroke = ({
  d,
  size = 18,
  color = "#fff",
  weight = 2.2,
}: P & { d: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d={d}
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
