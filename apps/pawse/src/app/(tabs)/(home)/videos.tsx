import { useLocalSearchParams } from "expo-router";

import WatchPage from "../../../features/pages/watch-page";

/** Every video from your channels (or YouTube's picks), opened from Home. */
export default function Videos() {
  const { feed } = useLocalSearchParams<{ feed?: string }>();
  return <WatchPage pushed feed={feed === "home" ? "home" : "subs"} />;
}
