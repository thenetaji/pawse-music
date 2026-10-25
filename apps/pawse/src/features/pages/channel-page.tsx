import { bestThumbnail, type ChannelPage as Page } from "@pawse/music-core";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, Share, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { showSheet } from "../../components/action-sheet";
import { HideGlyph, PinGlyph, ShareGlyph } from "../../components/glyphs";
import {
  CatState,
  PressScale,
  Screen,
  SkeletonShelves,
} from "../../components/ui";
import { VideoCard } from "../../components/video-card";
import { setSubscribed, useSubscribed } from "../../data/channels";
import { isPinned, togglePin } from "../../data/pins";
import { blockChannel } from "../../lib/block";
import { ytv } from "../../lib/engine";
import { useFocus } from "../../lib/focus";
import { haptic } from "../../lib/haptics";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { MoreGlyph } from "../now-playing/icons";
import { useAccent } from "../now-playing/now-palette";
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
  const subscribed = useSubscribed(id, p?.subscribed);
  const focus = useFocus();
  const accent = useAccent();
  const me = p && {
    id: p.channel.id,
    name: p.channel.name,
    avatar: p.channel.avatar,
  };
  const showMore = () =>
    me &&
    showSheet({
      actions: [
        {
          label: isPinned(me.id) ? "Unpin from Home" : "Pin to Home",
          icon: (c) => <PinGlyph size={22} color={c} />,
          onPress: () =>
            togglePin({
              kind: "channel",
              id: me.id,
              title: me.name,
              thumbnails: me.avatar,
            }),
        },
        {
          label: "Share",
          icon: (c) => <ShareGlyph size={22} color={c} />,
          onPress: () => {
            const link = `https://www.youtube.com/channel/${me.id}`;
            void Share.share(
              Platform.OS === "ios" ? { url: link } : { message: link },
            );
          },
        },
        {
          label: `Don't show ${me.name}`,
          icon: (c) => <HideGlyph size={22} color={c} />,
          destructive: true,
          onPress: () => blockChannel({ id: me.id, name: me.name }),
        },
      ],
    });
  return (
    <Screen
      title={p?.channel.name ?? ""}
      back
      background={<TopGlow height={300} />}
      onEndReached={loadMore}
      onRefresh={() => {
        setMore({ videos: [] });
        return page.reload();
      }}
      right={
        p ? (
          <PressScale
            onPress={showMore}
            hitSlop={10}
            accessibilityLabel="More"
            style={styles.more}
          >
            <MoreGlyph size={20} />
          </PressScale>
        ) : undefined
      }
    >
      {p ? (
        <>
          <View style={styles.head}>
            {avatar ? <Image source={avatar} style={styles.avatar} /> : null}
            <View style={{ flex: 1 }}>
              {p.channel.subscribersText && focus.counts ? (
                <Text style={styles.subs}>{p.channel.subscribersText}</Text>
              ) : null}
            </View>
            <PressScale
              onPress={() => {
                haptic.light();
                if (me) setSubscribed(me, !subscribed);
              }}
              accessibilityLabel={subscribed ? "Unsubscribe" : "Subscribe"}
              style={[
                styles.subBtn,
                subscribed ? styles.subOn : { backgroundColor: accent },
              ]}
            >
              <Text style={[styles.subText, subscribed && styles.subTextOn]}>
                {subscribed ? "Subscribed" : "Subscribe"}
              </Text>
            </PressScale>
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
  more: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  subBtn: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    justifyContent: "center",
  },
  subOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  subText: { color: "#fff", fontSize: 14, ...display("800") },
  subTextOn: { color: "rgba(255,255,255,0.85)" },
});
