import { showSheet } from "../components/action-sheet";
import { UnsubscribeGlyph } from "../components/glyphs";
import { type FollowedChannel, setSubscribed } from "../data/channels";

/** Subscribe straight away; unsubscribing asks first, like YouTube, so a stray tap doesn't lose a channel. */
export function toggleSubscription(ch: FollowedChannel, subscribed: boolean) {
  if (!subscribed) return setSubscribed(ch, true);
  showSheet({
    title: `Unsubscribe from ${ch.name}?`,
    actions: [
      {
        label: "Unsubscribe",
        destructive: true,
        icon: (c) => <UnsubscribeGlyph size={22} color={c} />,
        onPress: () => setSubscribed(ch, false),
      },
    ],
  });
}
