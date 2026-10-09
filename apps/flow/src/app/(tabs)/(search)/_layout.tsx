import { Stack } from "expo-router";

import { setActiveTab } from "../../../lib/nav";

export { ErrorScreen as ErrorBoundary } from "../../../components/error-screen";

// Any screen in this tab gaining focus makes it the tab detail pages open in.
export default function TabStack() {
  return (
    <Stack
      screenListeners={{ focus: () => setActiveTab("search") }}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
      }}
    />
  );
}
