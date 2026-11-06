import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

/** The iOS share extension opens pawse://shared only to bring Pawse forward; the song is waiting in the App Group. */
export default function Shared() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, []);
  return <View style={{ flex: 1 }} />;
}
