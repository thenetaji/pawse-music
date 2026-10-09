import { Stack } from "expo-router";

import { setActiveTab } from "../../../lib/nav";

export { ErrorScreen as ErrorBoundary } from "../../../components/error-screen";

// The tab always opens on its own home screen, never on a page deeper in the stack.
export const unstable_settings = { initialRouteName: "index" };

// Any screen in this tab gaining focus makes it the tab detail pages open in.
export default function TabStack() {
  return (
    <Stack
      screenListeners={{ focus: () => setActiveTab("home") }}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
      }}
    />
  );
}
