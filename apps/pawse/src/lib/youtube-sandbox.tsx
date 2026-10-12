import type { JsSandbox } from "@pawse/innertube";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const restart = useCallback(() => {
    bridge.detach("sandbox web view process ended");
    setGeneration((g) => g + 1);
  }, []);
  useEffect(() => () => bridge.detach("sandbox unmounted"), []);
  return (
    <WebView
      key={generation}
      ref={ref}
      source={SOURCE}
      originWhitelist={["*"]}
      incognito
      javaScriptEnabled
      setSupportMultipleWindows={false}
      onMessage={(e) => {
        const data = e.nativeEvent.data;
        // The page announces itself once its script ran; everything queued goes out then.
        if (data.startsWith('{"ready"'))
          bridge.attach((js) => ref.current?.injectJavaScript(js));
        else bridge.onMessage(data);
      }}
      onContentProcessDidTerminate={restart}
      onRenderProcessGone={restart}
      style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
    />
  );
}
