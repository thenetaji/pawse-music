import { AirPlayButton } from "@rntp/player";
import { View } from "react-native";

// System route picker (AirPlay / Bluetooth); iOS draws its own icon.
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
      <AirPlayButton
        tintColor="rgba(255,255,255,0.62)"
        style={{ width: 30, height: 30 }}
      />
    </View>
  );
}
