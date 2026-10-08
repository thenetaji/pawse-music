import { bestThumbnail, type Thumbnail } from "@studio/music-core";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";

const FALLBACK: [string, string][] = [
  ["#5B3BD6", "#FF5A7A"],
  ["#1FA59A", "#2F6BD8"],
  ["#F08A3C", "#D9539E"],
  ["#3FB27F", "#1E6E9E"],
  ["#9A5BEF", "#2F9ED8"],
];

// Artwork with a colourful note fallback when there's no image or it fails to load.
export function Artwork({
  thumbnails,
  size,
  radius = 8,
  round,
  style,
  seed,
}: {
  thumbnails?: Thumbnail[];
  size: number;
  radius?: number;
  round?: boolean;
  style?: ViewStyle;
  seed?: string;
}) {
  const uri = thumbnails?.length
    ? bestThumbnail(thumbnails, Math.min(544, Math.round(size * 3)))
    : undefined;
  const [failed, setFailed] = useState<string | null>(null);
  const r = round ? size / 2 : radius;
  const broken = !uri || failed === uri;
  const key = seed ?? uri ?? "";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const g = FALLBACK[Math.abs(h) % FALLBACK.length];
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          overflow: "hidden",
          backgroundColor: "#141418",
        },
        style,
      ]}
    >
      {broken ? (
        <LinearGradient
          colors={g}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <Svg width={size * 0.36} height={size * 0.36} viewBox="0 0 24 24">
            <Path
              d="M9 18V6l11-2v12"
              stroke="rgba(255,255,255,0.85)"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <Path
              d="M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
              fill="rgba(255,255,255,0.85)"
            />
          </Svg>
        </LinearGradient>
      ) : (
        <Image
          source={uri}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={200}
          recyclingKey={uri}
          onError={() => setFailed(uri)}
        />
      )}
    </View>
  );
}
