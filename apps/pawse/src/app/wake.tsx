import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { wakeUp } from "../features/alarm/alarm";

/** The Android alarm notification opens pawse://wake: start the music, then step out of the way. */
export default function Wake() {
  useEffect(() => {
    void wakeUp();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  return <View style={{ flex: 1 }} />;
}
