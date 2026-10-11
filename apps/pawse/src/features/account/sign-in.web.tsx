import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { desktop } from "../../lib/desktop";
import { display } from "../../lib/type";
import { SignInScreen, type SignInStep, saveSession } from "./sign-in-screen";

export default function SignIn() {
  const [step, setStep] = useState<SignInStep>("intro");
  if (!desktop) return <BrowserOnly />;
  const bridge = desktop;

  const start = () => {
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

  return (
    <SignInScreen
      step={step}
      onContinue={start}
      web={
        <View style={styles.wait}>
          <Text style={styles.waitTitle}>Finish in the Google window</Text>
          <Text style={styles.waitSub}>
            Pawse picks up your account as soon as YouTube Music opens there.
          </Text>
        </View>
      }
    />
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
  close: { color: "rgba(255,255,255,0.7)", fontSize: 16 },
});
