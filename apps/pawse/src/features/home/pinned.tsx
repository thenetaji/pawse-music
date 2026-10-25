import { bestThumbnail } from "@pawse/music-core";
import { player } from "@pawse/player";
import { Image } from "expo-image";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { showSheet } from "../../components/action-sheet";
import { Artwork } from "../../components/artwork";
import { ChevronLeft, ChevronRight, PinGlyph } from "../../components/glyphs";
import { PressScale, SectionTitle } from "../../components/ui";
import { movePin, type Pin, unpin, usePins } from "../../data/pins";
import { rightClick } from "../../lib/context-menu";
import { go } from "../../lib/nav";
import { display } from "../../lib/type";
import { openWatch } from "../watch/store";

const open = (p: Pin) => {
  switch (p.kind) {
    case "video":
      return openWatch({ id: p.id, title: p.title, thumbnails: p.thumbnails });
    case "song":
      if (p.track) return void player.play([p.track], 0, { radio: true });
      return void player.playRadio({ videoId: p.id, title: p.title });
    default:
      return go(`/${p.kind}/${p.id}`);
  }
};

const menu = (p: Pin) =>
  showSheet({
    actions: [
      {
        label: "Move left",
        icon: (c) => <ChevronLeft size={22} color={c} />,
        onPress: () => movePin(p.id, -1),
      },
      {
        label: "Move right",
        icon: (c) => <ChevronRight size={22} color={c} />,
        onPress: () => movePin(p.id, 1),
      },
      {
        label: "Unpin",
        icon: (c) => <PinGlyph size={22} color={c} />,
        destructive: true,
        onPress: () => unpin(p.id),
      },
    ],
  });

/** What you pinned with "Pin to Home", in your order; press and hold to move or unpin. */
export function Pinned() {
  const list = usePins((s) => s.list);
  if (!list.length) return null;
  return (
    <View>
      <SectionTitle title="Pinned" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {list.map((p) => (
          <PressScale
            key={p.id}
            onPress={() => open(p)}
            onLongPress={() => menu(p)}
            {...rightClick(() => menu(p))}
            style={p.kind === "video" ? styles.wide : styles.tile}
          >
            {p.kind === "video" ? (
              <Image
                source={bestThumbnail(p.thumbnails, 480)}
                style={styles.thumb}
                contentFit="cover"
              />
            ) : (
              <Artwork
                thumbnails={p.thumbnails}
                size={120}
                radius={12}
                round={p.kind === "channel" || p.kind === "artist"}
                seed={p.title}
              />
            )}
            <Text style={styles.title} numberOfLines={2}>
              {p.title}
            </Text>
          </PressScale>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, gap: 12 },
  tile: { width: 120 },
  wide: { width: 214 },
  thumb: {
    width: 214,
    height: 120,
    borderRadius: 12,
    backgroundColor: "#16151b",
  },
  title: {
    color: "#fff",
    fontSize: 13.5,
    lineHeight: 17,
    marginTop: 7,
    ...display("700"),
  },
});
