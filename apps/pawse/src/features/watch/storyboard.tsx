import type { Storyboard } from "@pawse/music-core";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

const sheetsOf = (sb: Storyboard) => Math.ceil(sb.count / (sb.cols * sb.rows));
const sheetUrl = (sb: Storyboard, n: number) =>
  sb.url.replace("{n}", String(n));

/** Starts loading every sheet, so the first drag along the bar already has its pictures. */
export const prefetchStoryboard = (sb: Storyboard) =>
  void Image.prefetch(
    Array.from({ length: sheetsOf(sb) }, (_, n) => sheetUrl(sb, n)),
  );

/** The picture YouTube has for this moment: one frame cut out of its sheet. */
export function StoryboardFrame({
  sb,
  sec,
  scale = 1,
}: {
  sb: Storyboard;
  sec: number;
  scale?: number;
}) {
  const i = Math.max(0, Math.min(sb.count - 1, Math.floor(sec / sb.everySec)));
  const per = sb.cols * sb.rows;
  const at = i % per;
  return (
    <View
      style={[
        styles.frame,
        { width: sb.width * scale, height: sb.height * scale },
      ]}
    >
      <Image
        source={sheetUrl(sb, Math.floor(i / per))}
        contentFit="fill"
        style={{
          position: "absolute",
          left: -(at % sb.cols) * sb.width * scale,
          top: -Math.floor(at / sb.cols) * sb.height * scale,
          width: sb.cols * sb.width * scale,
          height: sb.rows * sb.height * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", borderRadius: 8, backgroundColor: "#111" },
});
