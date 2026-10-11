import CookieManager from "@react-native-cookies/cookies";
import { useRef, useState } from "react";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { SignInScreen, type SignInStep, saveSession } from "./sign-in-screen";

const START =
  "https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&passive=true&continue=https%3A%2F%2Fmusic.youtube.com%2F";
// Google refuses embedded sign-in for unknown browsers; present as mobile Safari.
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

export default function SignIn() {
  const [step, setStep] = useState<SignInStep>("intro");
  const done = useRef(false);

  const onNav = async (nav: WebViewNavigation) => {
    if (done.current || !nav.url.startsWith("https://music.youtube.com"))
      return;
    const jar = await CookieManager.get("https://music.youtube.com", true);
    if (!jar.SAPISID && !jar["__Secure-3PAPISID"]) return;
    done.current = true;
    saveSession(
      Object.values(jar)
        .map((c) => `${c.name}=${c.value}`)
        .join("; "),
    );
    setStep("done");
  };

  return (
    <SignInScreen
      step={step}
      onContinue={() => setStep("web")}
      web={
        <WebView
          source={{ uri: START }}
          userAgent={UA}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onNavigationStateChange={onNav}
          style={{ flex: 1, backgroundColor: "#000" }}
        />
      }
    />
  );
}
