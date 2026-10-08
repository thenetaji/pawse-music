import CookieManager from "@react-native-cookies/cookies";
import { router } from "expo-router";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { useLibrary } from "../../data/library";

const START =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
// Google refuses embedded sign-in for unknown browsers; present as mobile Safari.
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

export default function SignIn() {
  const insets = useSafeAreaInsets();
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
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000", paddingTop: insets.top }}>
      <View style={styles.bar}>
        <Text style={styles.title}>Sign in to YouTube Music</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        Only used for your home feed, likes and history. Music always streams
        signed out.
      </Text>
      <WebView
        source={{ uri: START }}
        userAgent={UA}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        onNavigationStateChange={onNav}
        style={{ flex: 1, backgroundColor: "#000" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    height: 50,
  },
  title: { color: "#fff", fontSize: 17, fontWeight: "700" },
  cancel: { color: "rgba(255,255,255,0.7)", fontSize: 16 },
  note: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 13,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
});
