import { View } from "react-native";

import loading from "../../assets/cats/loading.json";
import { Lottie } from "./lottie";

// The cat is drawn with room around it, so it is shown larger than the space it stands in.
const GROW = 1.5;

/** A cat turning round under a spinner, for while a song loads. */
export function CatSpinner({ size }: { size: number }) {
  const s = Math.round(size * GROW);
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Lottie source={loading} size={s} autoPlay />
    </View>
  );
}
