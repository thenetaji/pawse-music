import CookieManager from "@react-native-cookies/cookies";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { PressScale } from "../../components/ui";
import { syncYouTubeLibrary, useLibrary } from "../../data/library";
import { haptic } from "../../lib/haptics";
import { useSetting } from "../../lib/settings";
import { Cat, type CatColor } from "../cat/cat";
import { useAccent } from "../now-playing/now-palette";

const START =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
// Google refuses embedded sign-in for unknown browsers; present as mobile Safari.
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

const PERKS = [
  "Your own home feed and mixes",
  "Likes and playlists from YouTube Music",
  "Plays saved to your history",
];

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  const color = useSetting<CatColor>("catColor", "orange");
  const name = useSetting("catName", "Mochi");
  const [step, setStep] = useState<"intro" | "web" | "done">("intro");
  const done = useRef(false);

  const onNav = async (nav: WebViewNavigation) => {
    if (done.current || !nav.url.startsWith("https://music.youtube.com"))
      return;
    const jar = await CookieManager.get("https://music.youtube.com", true);
    if (!jar.SAPISID && !jar["__Secure-3PAPISID"]) return;
    done.current = true;
    const header = Object.values(jar)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    useLibrary
      .getState()
      .setSettings({ cookies: header, accountName: "YouTube Music" });
    haptic.success();
    setStep("done");
    syncYouTubeLibrary().catch(() => {});
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={{ width: 60 }} />
        <Text style={styles.barTitle}>{step === "web" ? "Google" : ""}</Text>
        <Pressable
          hitSlop={10}
          onPress={() => router.back()}
          style={{ width: 60, alignItems: "flex-end" }}
        >
          <Text style={styles.cancel}>
            {step === "done" ? "Done" : "Cancel"}
          </Text>
        </Pressable>
      </View>

      {step === "intro" ? (
        <Animated.View entering={FadeIn} style={styles.center}>
          <Cat mood="curious" size={130} color={color} />
          <Text style={styles.title}>Bring your music</Text>
          <Text style={styles.sub}>
            Sign in to YouTube Music and {name} learns what you love.
          </Text>
          <View style={styles.perks}>
            {PERKS.map((p, i) => (
              <Animated.View
                key={p}
                entering={FadeInDown.delay(120 + i * 80)}
                style={styles.perk}
              >
                <View style={[styles.dot, { backgroundColor: accent }]} />
                <Text style={styles.perkText}>{p}</Text>
              </Animated.View>
            ))}
          </View>
          <Text style={styles.note}>
            Your account is never used to stream. Music always plays signed out.
          </Text>
          <PressScale onPress={() => setStep("web")} style={styles.cta}>
            <Text style={styles.ctaText}>Continue with Google</Text>
          </PressScale>
        </Animated.View>
      ) : step === "web" ? (
        <WebView
          source={{ uri: START }}
          userAgent={UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onNavigationStateChange={onNav}
          style={{ flex: 1, backgroundColor: "#000" }}
        />
      ) : (
        <Animated.View entering={FadeIn} style={styles.center}>
          <Cat mood="excited" size={140} color={color} />
          <Text style={styles.title}>You’re in</Text>
          <Text style={styles.sub}>
            {name} is pulling in your likes and playlists.
          </Text>
          <PressScale onPress={() => router.back()} style={styles.cta}>
            <Text style={styles.ctaText}>Let’s listen</Text>
          </PressScale>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    height: 50,
  },
  barTitle: { color: "#fff", fontSize: 17, fontWeight: "700" },
  cancel: { color: "rgba(255,255,255,0.75)", fontSize: 17 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 30,
    paddingBottom: 40,
  },
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: -0.8,
    marginTop: 16,
  },
  sub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  perks: { alignSelf: "stretch", marginTop: 26, gap: 12 },
  perk: { flexDirection: "row", alignItems: "center", gap: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  perkText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  note: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 26,
  },
  cta: {
    marginTop: 18,
    alignSelf: "stretch",
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaText: { color: "#000", fontSize: 17, fontWeight: "800" },
});
