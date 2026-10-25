import { Stack } from "expo-router";

import { setActiveTab } from "../../../lib/nav";

export { ErrorScreen as ErrorBoundary } from "../../../components/error-screen";

export const unstable_settings = { initialRouteName: "watch" };

export default function TabStack() {
  return (
    <Stack
      screenListeners={{ focus: () => setActiveTab("watch") }}
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#000" },
      }}
    />
  );
}
