import { router } from "expo-router";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { hideSheet, showSheet } from "../../components/action-sheet";
import { SheetScrollView } from "../../components/pull-to-close";
import { kv } from "../../data/storage";
import { appVersion } from "../../lib/app-version";
import { desktop } from "../../lib/desktop";
import { haptic } from "../../lib/haptics";
import { push } from "../../lib/nav";
import { getSetting } from "../../lib/settings";
import { display } from "../../lib/type";

const KEY = "pawse.whatsNew.seen";
const RELEASE = /^1\.13\./;

type Item = { title: string; body: string; open: () => void };

// The tab pages sit under the modals, so close those first.
const toTab = (path: "/" | "/watch") => () => {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(path);
};

function items(): Item[] {
  return [
    {
      title: "Mixes by mood",
      body: "Tap 90s & retro, Chill or Loud on Home. Smooth shuffle keeps each song close to the last.",
      open: toTab("/"),
    },
    {
      title: "4K, chapters and a video queue",
      body: "Press and hold a video for Play next. Chapters show their pictures; 4K is in Settings.",
      open: toTab("/watch"),
    },
    {
      title: "Community extras",
      body: "SponsorBlock skips, DeArrow titles and Return YouTube Dislike counts.",
      open: () => push("/settings/videos"),
    },
    Platform.OS === "ios"
      ? {
          title: "Dynamic Island styles",
          body: "Classic with a progress ring, or just the time left.",
          open: () => push("/settings/look"),
        }
      : {
          title: "Mindful mode",
          body: "Set a daily limit for videos; at the limit Mochi falls asleep and music plays on.",
          open: () => push("/settings/videos"),
        },
    desktop?.discordActivity
      ? {
          title: "Discord status",
          body: "Friends see the song you're playing as “Listening to Pawse”.",
          open: () => push("/settings/accounts"),
        }
      : {
          title: "Equaliser with AutoEq",
          body: "Pick your headphones and Pawse applies the correction made for them.",
          open: () => push("/equaliser"),
        },
  ];
}

function WhatsNew() {
  const { height } = useWindowDimensions();
  return (
    <View>
      <Text style={styles.title}>What’s new in 1.13</Text>
      <SheetScrollView
        style={{ maxHeight: Math.max(260, height * 0.6) }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {items().map((item) => (
          <View key={item.title} style={styles.item}>
            <View style={styles.text}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Try ${item.title}`}
              onPress={() => {
                haptic.light();
                hideSheet();
                item.open();
              }}
              style={({ pressed }) => [styles.try, pressed && styles.pressed]}
            >
              <Text style={styles.tryText}>Try it</Text>
            </Pressable>
          </View>
        ))}
      </SheetScrollView>
    </View>
  );
}

function showWhatsNew() {
  showSheet({ header: <WhatsNew />, actions: [], cancel: "Done" });
}

/** Shows the card once, on the first open after updating to 1.13; a fresh install only records the version. */
export function maybeShowWhatsNew() {
  const seen = kv.getItem(KEY);
  if (seen === appVersion) return;
  void kv.set(KEY, appVersion);
  const fresh = !getSetting("onboarded", false);
  const already = typeof seen === "string" && RELEASE.test(seen);
  if (!fresh && !already && RELEASE.test(appVersion))
    setTimeout(showWhatsNew, 1500);
}

const styles = StyleSheet.create({
  title: {
    color: "#fff",
    fontSize: 20,
    textAlign: "center",
    marginBottom: 12,
    ...display("800"),
  },
  list: { gap: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  text: { flex: 1 },
  itemTitle: { color: "#fff", fontSize: 15, ...display("700") },
  body: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  try: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  pressed: { opacity: 0.7 },
  tryText: { color: "#000", fontSize: 14, ...display("700") },
});
