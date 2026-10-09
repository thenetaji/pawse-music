import type { Shelf as ShelfT } from "@pawse/music-core";
import { useLocalSearchParams } from "expo-router";

import { Shelf } from "../../components/shelf";
import { CatState, Screen, SkeletonShelves } from "../../components/ui";
import { yt } from "../../lib/engine";
import { useResource } from "../../lib/use-resource";
import { TopGlow } from "./top-glow";

// The router already decodes params; decoding again throws on a bare "%" (e.g. "100% Hits").
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export default function MoodPage() {
  const { id, title, color } = useLocalSearchParams<{
    id: string;
    title?: string;
    color?: string;
  }>();
  const p = decode(id);
  const page = useResource<ShelfT[]>(`mood:${p}`, () => yt.moodPage(p));
  return (
    <Screen
      back
      title={title ? decode(title) : "Mood"}
      background={
        <TopGlow height={360} colors={color ? [color, color] : undefined} />
      }
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
