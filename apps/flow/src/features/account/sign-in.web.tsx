import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function SignIn() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        padding: 30,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 17, textAlign: "center" }}>
        Sign-in works in the iPhone and Android app.
      </Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
        <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 16 }}>
          Close
        </Text>
      </Pressable>
    </View>
  );
}
