import type {
  VideoFeed,
  VideoItem,
  VideoSearchResults,
} from "@pawse/music-core";
import { useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Path } from "react-native-svg";

import { CaughtUp } from "../../components/caught-up";
import { CloseGlyph } from "../../components/glyphs";
import { useTabRoot } from "../../components/page";
import { CatState, Chip, Screen, SkeletonShelves } from "../../components/ui";
import { ChannelRow, VideoCard } from "../../components/video-card";
import { useLibrary } from "../../data/library";
import { useVideoFilter } from "../../lib/block";
import { ytv } from "../../lib/engine";
import { useSetting } from "../../lib/settings";
import { display } from "../../lib/type";
import { useResource } from "../../lib/use-resource";
import { useAccent } from "../now-playing/now-palette";
import { TopGlow } from "./top-glow";

type Feed = "home" | "subs";
type Page = {
  items: (VideoFeed | VideoSearchResults)["items"];
  continuation?: string;
};

/** YouTube without the noise: a feed or your subscriptions, search, and no Shorts anywhere. */
export default function WatchPage() {
  useTabRoot("watch");
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const calm = useSetting("homeStyle", "full") !== "full";
  const [feed, setFeed] = useState<Feed>(signedIn ? "subs" : "home");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const input = useRef<TextInput>(null);

  const key = query ? `watch:q:${query}` : `watch:${feed}`;
  const first = useResource<Page>(
    key,
    () =>
      query
        ? ytv.search(query)
        : feed === "subs"
          ? ytv.subscriptions()
          : ytv.home(),
    { keep: !query },
  );
  const [more, setMore] = useState<{ key: string } & Page>({
    key,
    items: [],
  });
  const [busy, setBusy] = useState(false);
  const extra =
    more.key === key ? more : { key, items: [], continuation: undefined };
  const items = [...(first.data?.items ?? []), ...extra.items];
  const cont = extra.items.length
    ? extra.continuation
    : first.data?.continuation;
  // Calm stops after one page; searches always page.
  const endless = !calm || !!query;

  const loadMore = () => {
    if (busy || !cont || !endless) return;
    setBusy(true);
    const next: Promise<Page> = query
      ? ytv.search(query, cont)
      : feed === "subs"
        ? ytv.subscriptions(cont)
        : ytv.home(cont);
    next
      .then((r) =>
        setMore({
          key,
          items: [...extra.items, ...r.items],
          continuation: r.continuation,
        }),
      )
      .catch(() => {})
      .finally(() => setBusy(false));
  };

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    setQuery(v);
    Keyboard.dismiss();
  };
  const clear = () => {
    setText("");
    setQuery("");
    Keyboard.dismiss();
  };

  const keep = useVideoFilter();
  const seen = new Set<string>();
  const unique = items.filter(
    (x) =>
      !seen.has(x.id) &&
      !!seen.add(x.id) &&
      (x.type === "channel" || keep(x as VideoItem)),
  );

  return (
    <Screen
      title="Watch"
      tab="watch"
      background={<TopGlow height={300} />}
      onRefresh={first.reload}
      refreshing={false}
      onEndReached={loadMore}
    >
      <View style={styles.field}>
        <Svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={2.6}
          strokeLinecap="round"
        >
          <Circle cx="11" cy="11" r="7" />
          <Path d="M20 20l-3.5-3.5" />
        </Svg>
        <TextInput
          ref={input}
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="Search videos"
          placeholderTextColor="rgba(255,255,255,0.4)"
          returnKeyType="search"
          autoCorrect={false}
          selectionColor={accent}
          style={styles.input}
        />
        {text || query ? (
          <Pressable hitSlop={10} onPress={clear} style={styles.clear}>
            <CloseGlyph size={10} weight={3.2} color="#000" />
          </Pressable>
        ) : null}
      </View>
      {!query && signedIn ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label="Subscriptions"
            on={feed === "subs"}
            accent={accent}
            onPress={() => setFeed("subs")}
          />
          <Chip
            label="For you"
            on={feed === "home"}
            accent={accent}
            onPress={() => setFeed("home")}
          />
        </ScrollView>
      ) : null}
      {query ? (
        <Text style={styles.note} numberOfLines={1}>
          Results for “{query}”
        </Text>
      ) : null}
      <View style={{ height: 16 }} />
      {first.data ? (
        unique.length ? (
          unique.map((x, i) => (
            <Animated.View
              key={x.id}
              entering={FadeInDown.duration(380).delay(Math.min(i, 6) * 50)}
            >
              {x.type === "channel" ? (
                <ChannelRow channel={x} />
              ) : (
                <VideoCard video={x as VideoItem} />
              )}
            </Animated.View>
          ))
        ) : (
          <CatState
            kind="empty"
            message={query ? "No videos for that." : "Nothing new to watch."}
          />
        )
      ) : first.error ? (
        <CatState
          kind="error"
          message={first.error.message}
          action="Try again"
          onAction={first.reload}
        />
      ) : (
        <SkeletonShelves />
      )}
      {first.data && busy ? <SkeletonShelves count={1} /> : null}
      {first.data && !query && (!endless || !cont) ? (
        <CaughtUp note="That's everything for now. No Shorts, no endless feed." />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 4,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  input: { flex: 1, color: "#fff", fontSize: 16, height: 40 },
  clear: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 14 },
  note: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    marginHorizontal: 16,
    marginTop: 14,
    ...display("700"),
  },
});
