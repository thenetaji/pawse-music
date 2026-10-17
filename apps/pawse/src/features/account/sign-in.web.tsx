import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Spinner } from "../../components/spinner";
import { PressScale } from "../../components/ui";
import { desktop } from "../../lib/desktop";
import { display } from "../../lib/type";
import { useAccent } from "../now-playing/now-palette";
import { SignInScreen, type SignInStep, saveSession } from "./sign-in-screen";

// Firefox writes a new sign-in to disk within seconds; Pawse looks this often while you sign in.
const POLL_MS = 2500;

type Mode = "browser" | "window";
type Miss = "no-firefox" | "signed-out" | undefined;

export default function SignIn() {
  const [step, setStep] = useState<SignInStep>("intro");
  const [mode, setMode] = useState<Mode>("browser");
  if (!desktop) return <BrowserOnly />;
  const bridge = desktop;

  const inWindow = () => {
    setMode("window");
    setStep("web");
    bridge
      .signIn()
      .then((header) => {
        if (!header) return setStep("intro");
        saveSession(header);
        setStep("done");
      })
      .catch(() => setStep("intro"));
  };
  const withBrowser = () => {
    setMode("browser");
    setStep("web");
    void bridge.browserOpen();
  };

  return (
    <SignInScreen
      step={step}
      onContinue={withBrowser}
      webTitle={mode === "browser" ? "Firefox" : "Google"}
      actions={
        <View style={styles.actions}>
          <PressScale onPress={withBrowser} style={styles.cta}>
            <Text style={styles.ctaText}>Use my browser</Text>
          </PressScale>
          <Text style={styles.hint}>
            Sign in on YouTube Music in Firefox, and Pawse picks it up.
          </Text>
          <PressScale onPress={inWindow} style={styles.ghost}>
            <Text style={styles.ghostText}>Sign in here instead</Text>
          </PressScale>
        </View>
      }
      web={
        mode === "browser" ? (
          <BrowserWait
            onFound={(cookies) => {
              saveSession(cookies);
              setStep("done");
            }}
            onWindow={inWindow}
          />
        ) : (
          <View style={styles.wait}>
            <Text style={styles.waitTitle}>Finish in the Google window</Text>
            <Text style={styles.waitSub}>
              Pawse picks up your account as soon as YouTube Music opens there.
            </Text>
          </View>
        )
      }
    />
  );
}

// Keeps reading Firefox's cookie store until YouTube Music is signed in there.
function BrowserWait({
  onFound,
  onWindow,
}: {
  onFound: (cookies: string) => void;
  onWindow: () => void;
}) {
  const accent = useAccent();
  const [miss, setMiss] = useState<Miss>();
  const [browser, setBrowser] = useState<string>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: polls once per visit; onFound changes every render.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const look = async () => {
      const r = await desktop?.browserSignIn().catch(() => null);
      if (!live) return;
      if (r?.cookies) return onFound(r.cookies);
      setMiss(r?.error);
      setBrowser(r?.browser);
      timer = setTimeout(look, POLL_MS);
    };
    void look();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, []);

  const steps = [
    "YouTube Music just opened in your browser.",
    `Sign in there with ${browser ?? "Firefox"}.`,
    "Come back here. Pawse finds it by itself.",
  ];
  return (
    <View style={styles.wait}>
      <Text style={styles.waitTitle}>Sign in with Firefox</Text>
      <View style={styles.steps}>
        {steps.map((t, i) => (
          <View key={t} style={styles.step}>
            <View style={[styles.num, { backgroundColor: accent }]}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            <Text style={styles.stepText}>{t}</Text>
          </View>
        ))}
      </View>
      <View style={styles.status}>
        {miss === "no-firefox" ? (
          <Text style={styles.statusText}>
            Pawse can&apos;t find Firefox on this computer. Use Firefox, or sign
            in here instead.
          </Text>
        ) : (
          <>
            <Spinner size={16} color="rgba(255,255,255,0.6)" width={2} />
            <Text style={styles.statusText}>
              {miss === "signed-out"
                ? `Waiting for ${browser ?? "Firefox"}`
                : "Looking for your sign-in"}
            </Text>
          </>
        )}
      </View>
      <View style={styles.row}>
        <PressScale
          onPress={() => void desktop?.browserOpen()}
          style={styles.small}
        >
          <Text style={styles.smallText}>Open YouTube Music again</Text>
        </PressScale>
        <PressScale onPress={onWindow} style={styles.small}>
          <Text style={styles.smallText}>Sign in here instead</Text>
        </PressScale>
      </View>
    </View>
  );
}

function BrowserOnly() {
  return (
    <View style={styles.wait}>
      <Text style={styles.waitSub}>
        Sign-in works in the Pawse apps for phones and computers.
      </Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={styles.close}>Close</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { alignSelf: "stretch", marginTop: 18 },
  cta: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  ctaText: { color: "#000", fontSize: 17, ...display("800") },
  hint: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  ghost: {
    marginTop: 14,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
  },
  ghostText: { color: "#fff", fontSize: 16, ...display("700") },
  wait: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  waitTitle: { color: "#fff", fontSize: 22, ...display("800") },
  waitSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    textAlign: "center",
    marginTop: 8,
    maxWidth: 360,
  },
  steps: { marginTop: 24, gap: 14, width: "100%", maxWidth: 400 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  num: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { color: "#000", fontSize: 14, ...display("800") },
  stepText: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "500" },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 28,
    maxWidth: 400,
  },
  statusText: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.6)",
    fontSize: 14,
    textAlign: "center",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 24 },
  small: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.18)",
  },
  smallText: { color: "#fff", fontSize: 14, ...display("700") },
  close: { color: "rgba(255,255,255,0.7)", fontSize: 16 },
});
