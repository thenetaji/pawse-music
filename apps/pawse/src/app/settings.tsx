import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronRight } from "../components/glyphs";
import { styles as rows } from "../components/settings-rows";
import { RIPPLE } from "../components/ui";
import { useLibrary } from "../data/library";
import { useAccent } from "../features/now-playing/now-palette";
import {
  type Group,
  GROUPS,
  type GroupId,
  openGroup,
  groupTitle,
  useSummaries,
} from "../features/settings/groups";
import { searchSettings } from "../features/settings/search";
import { useAiStatus } from "../lib/ai/model";
import { yt } from "../lib/engine";
import { push } from "../lib/nav";
import { useSetting } from "../lib/settings";
import { display } from "../lib/type";
import { useResource } from "../lib/use-resource";

// Daily things first; Alarm, Experimental and About close the list.
const MAIN: GroupId[] = [
  "playback",
  "lyrics",
  "videos",
  "look",
  "library",
  "privacy",
  "accounts",
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const catName = useSetting("catName", "Mochi");
  const summaries = useSummaries();
  const ai = useAiStatus();
  const hasAi = !!ai && ai !== "unavailable";
  const shown = (g: Group) =>
    (g.id !== "experimental" || hasAi) &&
    (g.id !== "alarm" || summaries.alarm !== undefined);
  const searching = query.trim().length > 0;
  const hits = searching ? searchSettings(query, catName, hasAi) : [];

  return (
    <ScrollView
      style={styles.root}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ paddingTop: insets.top + 14, paddingBottom: 80 }}
    >
      <View style={styles.head}>
        <Text style={styles.h1}>Settings</Text>
        <Pressable hitSlop={10} onPress={() => router.back()}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
      </View>

      <AccountCard />

      <TextInput
        value={query}
        onChangeText={setQuery}
        style={styles.search}
        placeholder="Search settings"
        placeholderTextColor="rgba(255,255,255,0.4)"
        selectionColor="#fff"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Search settings"
      />

      {searching ? (
        hits.length ? (
          <View style={rows.group}>
            {hits.map((h) => (
              <Pressable
                key={`${h.group}:${h.label}`}
                onPress={() => openGroup(h.group)}
                android_ripple={RIPPLE}
                style={({ pressed }) => [
                  rows.row,
                  styles.hit,
                  pressed && !RIPPLE && rows.pressed,
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={rows.label}>{h.label}</Text>
                  <Text style={styles.summary}>{groupTitle(h.group)}</Text>
                </View>
                <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.none}>No settings match “{query.trim()}”.</Text>
        )
      ) : (
        <>
          <GroupList
            groups={GROUPS.filter((g) => MAIN.includes(g.id))}
            summaries={summaries}
          />
          <GroupList
            groups={GROUPS.filter((g) => !MAIN.includes(g.id) && shown(g))}
            summaries={summaries}
          />
        </>
      )}
    </ScrollView>
  );
}

function GroupList({
  groups,
  summaries,
}: {
  groups: Group[];
  summaries: Partial<Record<GroupId, string>>;
}) {
  return (
    <View style={[rows.group, styles.list]}>
      {groups.map(({ id, title, Icon }) => (
        <Pressable
          key={id}
          onPress={() => openGroup(id)}
          android_ripple={RIPPLE}
          style={({ pressed }) => [
            rows.row,
            styles.hit,
            pressed && !RIPPLE && rows.pressed,
          ]}
        >
          <View style={styles.tile}>
            <Icon size={18} color="#fff" strokeWidth={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={rows.label}>{title}</Text>
            {summaries[id] ? (
              <Text style={styles.summary} numberOfLines={1}>
                {summaries[id]}
              </Text>
            ) : null}
          </View>
          <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
        </Pressable>
      ))}
    </View>
  );
}

// Who is signed in to YouTube Music, or the way to sign in; both lead on from here.
function AccountCard() {
  const accent = useAccent();
  const signedIn = useLibrary((s) => !!s.settings.cookies);
  if (!signedIn)
    return (
      <Pressable style={styles.card} onPress={() => push("/sign-in")}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: accent }]}>
            Sign in to YouTube Music
          </Text>
          <Text style={styles.summary}>
            For your feed, likes and playlists. Music plays without it.
          </Text>
        </View>
        <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
      </Pressable>
    );
  return <SignedInCard />;
}

// Asks YouTube who is signed in, so a rejected session is visible instead of silently doing nothing.
function SignedInCard() {
  const fallback = useLibrary((s) => s.settings.accountName);
  const me = useResource("account:me", () => yt.accountInfo());
  const rejected = !me.loading && !me.data;
  return (
    <Pressable
      style={styles.card}
      onPress={() => (rejected ? push("/sign-in") : openGroup("accounts"))}
    >
      {me.data?.photo ? (
        <Image source={me.data.photo} style={styles.photo} />
      ) : null}
      <View style={{ flex: 1 }}>
        {rejected ? (
          <Text style={[styles.cardTitle, { color: "#FF9F43" }]}>
            YouTube didn’t accept this sign-in. Tap to sign in again.
          </Text>
        ) : (
          <>
            <Text style={styles.cardTitle}>
              {me.loading
                ? (fallback ?? "Signed in")
                : (me.data?.name ?? fallback)}
            </Text>
            <Text style={styles.summary}>
              {me.data?.handle ?? "YouTube Music"}
            </Text>
          </>
        )}
      </View>
      {rejected ? null : (
        <ChevronRight size={16} color="rgba(255,255,255,0.35)" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
  },
  h1: { color: "#fff", fontSize: 34, ...display("800"), letterSpacing: -0.8 },
  done: { color: "#fff", fontSize: 17, fontWeight: "600" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginHorizontal: 16,
    marginTop: 18,
    padding: 16,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  photo: { width: 48, height: 48, borderRadius: 24 },
  cardTitle: { color: "#fff", fontSize: 18, ...display("800") },
  search: {
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  list: { marginTop: 20 },
  hit: { paddingVertical: 10, gap: 12 },
  tile: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  summary: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 1 },
  none: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 15,
    paddingHorizontal: 32,
    paddingTop: 20,
  },
});
