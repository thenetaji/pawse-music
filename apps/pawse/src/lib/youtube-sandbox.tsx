import { type JsSandbox, SANDBOX_USER_AGENT } from "@pawse/innertube";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { SANDBOX_PAGE_HTML, SandboxBridge } from "./sandbox-bridge";

const bridge = new SandboxBridge();

/** Runs JS in a hidden WebView whose origin is youtube.com: BotGuard PO tokens and player challenges. */
export const youtubeSandbox: JsSandbox = bridge;

const SOURCE = { html: SANDBOX_PAGE_HTML, baseUrl: "https://www.youtube.com" };

/** Mount once near the root; renders nothing visible. */
export function YouTubeSandboxHost() {
  // Bumping the key builds a fresh WebView after the OS killed the old one's process.
  const [generation, setGeneration] = useState(0);
  const ref = useRef<WebView>(null);
  const loaded = useRef(false);
  const restart = useCallback(() => {
    bridge.detach("sandbox web view process ended");
    loaded.current = false;
    setGeneration((g) => g + 1);
  }, []);
  useEffect(() => () => bridge.detach("sandbox unmounted"), []);
  // WebView's own container defaults to flex: 1, so it sits in a 1×1 box that never takes layout space.
  return (
    <View pointerEvents="none" style={styles.host}>
      <WebView
        key={generation}
        ref={ref}
        source={SOURCE}
        originWhitelist={["*"]}
        incognito
        javaScriptEnabled
        // A desktop Safari UA, like the web_music client: a phone UA gets m.youtube.com, which has no BotGuard challenge.
        userAgent={SANDBOX_USER_AGENT}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsLinkPreview={false}
        dataDetectorTypes="none"
        // Only the page itself loads: any later navigation (player or BotGuard code) would open the YouTube app.
        onShouldStartLoadWithRequest={(r) =>
          r.isTopFrame === false ||
          r.url.startsWith("about:") ||
          (!loaded.current && /^https:\/\/www\.youtube\.com\/?$/.test(r.url))
        }
        onLoadEnd={() => {
          loaded.current = true;
        }}
        onMessage={(e) => {
          const data = e.nativeEvent.data;
          // The page announces itself once its script ran; everything queued goes out then.
          if (data.startsWith('{"ready"')) {
            loaded.current = true;
            bridge.attach((js) => ref.current?.injectJavaScript(js));
          } else bridge.onMessage(data);
        }}
        onContentProcessDidTerminate={restart}
        onRenderProcessGone={restart}
        style={styles.web}
        containerStyle={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  web: { width: 1, height: 1, flex: 0 },
});
