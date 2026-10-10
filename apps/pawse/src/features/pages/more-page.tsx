import type { CatalogItem, Shelf as ShelfT, Track } from "@pawse/music-core";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Card, openItem } from "../../components/shelf";
import { TrackRow } from "../../components/track-row";
import {
  CatState,
  Screen,
  SectionTitle,
  SkeletonRows,
} from "../../components/ui";
import { yt } from "../../lib/engine";
import { useContentWidth } from "../../lib/layout";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** "See all" for a shelf: songs as a list, albums and the rest as a two-column grid. */
export default function MorePage() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const token = decode(id);
  const page = useResource<ShelfT[]>(`more:${token}`, () => yt.browse(token));
  const width = useContentWidth();
  // Two columns on phones; wide windows fit as many ~190 pt cards as there is room for.
  const cols = Math.max(2, Math.floor((width - 40 + 16) / (190 + 16)));
  const card = Math.floor((width - 20 * 2 - 16 * (cols - 1)) / cols);
  const shelves = (page.data ?? []).filter((s) => s.items.length);
  return (
    <Screen
      back
      title={title ? decode(title) : (shelves[0]?.title ?? "")}
      background={<TopGlow height={300} />}
    >
      {page.data ? (
        shelves.length ? (
          shelves.map((s, i) => (
            <View key={`${s.title}${i}`}>
              {shelves.length > 1 && s.title ? (
                <SectionTitle title={s.title} />
              ) : null}
              <Items items={s.items} card={card} />
            </View>
          ))
        ) : (
          <CatState kind="empty" message="Nothing more here." />
        )
      ) : page.error ? (
        <CatState kind="error" action="Try again" onAction={page.reload} />
      ) : (
        <SkeletonRows />
      )}
    </Screen>
  );
}

function Items({ items, card }: { items: CatalogItem[]; card: number }) {
  if (items.every((i) => i.type === "track"))
    return (
      <View>
        {items.map((t) => (
          <TrackRow
            key={t.id}
            track={t as Track}
            onPress={() => openItem(t, items)}
          />
        ))}
      </View>
    );
  return (
    <View style={styles.grid}>
      {items.map((it, n) => (
        <Card key={`${it.id}${n}`} item={it} siblings={items} size={card} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingHorizontal: 20,
  },
});
