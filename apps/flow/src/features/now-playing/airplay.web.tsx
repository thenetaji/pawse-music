import { View } from "react-native";

import { AirPlayGlyph } from "./icons";

export function AirPlay() {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AirPlayGlyph color="rgba(255,255,255,0.62)" />
    </View>
  );
}
