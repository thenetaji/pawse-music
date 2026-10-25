import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { openWatch } from "../../features/watch/store";

/** A /video/<id> link opens the video in the watch overlay, then steps out of the way. */
export default function VideoLink() {
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  useEffect(() => {
    if (!id) return;
    openWatch({ id }, t ? Number(t) : undefined);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [id, t]);
  return <View style={{ flex: 1 }} />;
}
