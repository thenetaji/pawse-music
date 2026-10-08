import type { Shelf as ShelfT } from "@studio/music-core";
import { useLocalSearchParams } from "expo-router";

import { Shelf } from "../../components/shelf";
import { CatState, Screen, SkeletonShelves } from "../../components/ui";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

export default function MoodPage() {
  const { params, title } = useLocalSearchParams<{
    params: string;
    title?: string;
  }>();
  const p = decodeURIComponent(params);
  const page = useResource<ShelfT[]>(`mood:${p}`, () => yt.moodPage(p));
  return (
    <Screen
      back
      title={title ? decodeURIComponent(title) : "Mood"}
      background={<TopGlow height={320} />}
    >
      {page.data ? (
        page.data.map((s, i) => <Shelf key={`${s.title}${i}`} shelf={s} />)
      ) : page.error ? (
        <CatState kind="error" action="Try again" onAction={page.reload} />
      ) : (
        <SkeletonShelves />
      )}
    </Screen>
  );
}
