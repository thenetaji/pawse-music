import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";

import { DiscordSettings, Scrobbling } from "../../components/addon-settings";
import {
  Foot,
  Info,
  Link,
  styles as rows,
  Section,
  Toggle,
} from "../../components/settings-rows";
import { Screen } from "../../components/ui";
import { useLibrary } from "../../data/library";
import { signOut } from "../../features/account/sign-out";
import { useAccent } from "../../features/now-playing/now-palette";
import { yt } from "../../lib/engine";
import { push } from "../../lib/nav";
import { useResource } from "../../lib/use-resource";

export default function AccountSettings() {
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  const accountName = useLibrary((s) => s.settings.accountName);
  return (
    <Screen title="Connected accounts" back bottomInset={60}>
      <Section title="YouTube Music">
        {signedIn ? (
          <>
            <AccountRow fallback={accountName} />
            <Toggle k="syncLikes" label="Sync likes and follows" def />
            <Toggle
              k="reportPlays"
              label="Add what you play and watch to YouTube history"
              def
            />
            <Link label="Sign out" danger onPress={() => void signOut()} />
          </>
        ) : (
          <Link
            label="Sign in for your feed and likes"
            tint={accent}
            onPress={() => push("/sign-in")}
          />
        )}
      </Section>
      <Foot>Optional. Music plays without signing in.</Foot>

      <Scrobbling />
      <DiscordSettings />
    </Screen>
  );
}

// Asks YouTube who is signed in, so a rejected session is visible instead of silently doing nothing.
function AccountRow({ fallback }: { fallback: string | null }) {
  const me = useResource("account:me", () => yt.accountInfo());
  if (me.loading) return <Info label="Signed in" value="Checking…" />;
  if (!me.data)
    return (
      <Pressable onPress={() => push("/sign-in")} style={rows.row}>
        <Text style={[rows.label, { color: "#FF9F43", flex: 1 }]}>
          YouTube didn’t accept this sign-in. Tap to sign in again.
        </Text>
      </Pressable>
    );
  return (
    <View style={[rows.row, { gap: 12, justifyContent: "flex-start" }]}>
      {me.data.photo ? (
        <Image
          source={me.data.photo}
          style={{ width: 32, height: 32, borderRadius: 16 }}
        />
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={rows.label}>{me.data.name ?? fallback}</Text>
        {me.data.handle ? (
          <Text style={[rows.value, { fontSize: 13 }]}>{me.data.handle}</Text>
        ) : null}
      </View>
    </View>
  );
}
