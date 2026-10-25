import { bestThumbnail, type ChannelPage as Page } from "@pawse/music-core";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { CatState, Screen, SkeletonShelves } from "../../components/ui";
import { VideoCard } from "../../components/video-card";
import { ytv } from "../../lib/engine";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

/** A channel's uploads, newest first; never its Shorts. */
export default function ChannelPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useResource<Page>(`channel:${id}`, () => ytv.channel(id));
  const [more, setMore] = useState<{
    videos: Page["videos"];
    continuation?: string;
  }>({
    videos: [],
  });
  const [busy, setBusy] = useState(false);
  const p = page.data;
  const cont = more.videos.length ? more.continuation : p?.continuation;
  const loadMore = () => {
    if (busy || !cont) return;
    setBusy(true);
    ytv
      .channel(id, cont)
      .then((r) =>
        setMore({
          videos: [...more.videos, ...r.videos],
          continuation: r.continuation,
        }),
      )
      .catch(() => {})
      .finally(() => setBusy(false));
  };
  const avatar = p ? bestThumbnail(p.channel.avatar, 240) : undefined;
  return (
    <Screen
      title={p?.channel.name ?? ""}
      back
      background={<TopGlow height={300} />}
      onEndReached={loadMore}
    >
      {p ? (
        <>
          <View style={styles.head}>
            {avatar ? <Image source={avatar} style={styles.avatar} /> : null}
            {p.channel.subscribersText ? (
              <Text style={styles.subs}>{p.channel.subscribersText}</Text>
            ) : null}
          </View>
          {[...p.videos, ...more.videos].map((v, i) => (
            <Animated.View
              key={`${v.id}${i}`}
              entering={FadeInDown.duration(360).delay(Math.min(i, 6) * 50)}
            >
              <VideoCard video={v} hideChannel />
            </Animated.View>
          ))}
          {busy ? <SkeletonShelves count={1} /> : null}
        </>
      ) : page.error ? (
        <CatState
          kind="error"
          message="Couldn't open this channel."
          action="Try again"
          onAction={page.reload}
        />
      ) : (
        <SkeletonShelves />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginBottom: 20,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#222" },
  subs: { color: "rgba(255,255,255,0.65)", fontSize: 14, ...display("700") },
});
