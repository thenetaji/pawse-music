import { bestThumbnail, type Thumbnail } from "@studio/music-core";
import { Image } from "expo-image";
import { View, type ViewStyle } from "react-native";

export function Artwork({
  thumbnails,
  size,
  radius = 8,
  round,
  style,
}: {
  thumbnails?: Thumbnail[];
  size: number;
  radius?: number;
  round?: boolean;
  style?: ViewStyle;
}) {
  const uri = thumbnails?.length
    ? bestThumbnail(thumbnails, Math.min(544, Math.round(size * 3)))
    : undefined;
  const r = round ? size / 2 : radius;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: r,
          backgroundColor: "rgba(255,255,255,0.07)",
          overflow: "hidden",
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={uri}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={200}
          recyclingKey={uri}
        />
      ) : null}
    </View>
  );
}
