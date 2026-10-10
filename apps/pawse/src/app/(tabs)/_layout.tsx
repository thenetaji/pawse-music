import { Platform } from "react-native";

import { DockTabs } from "../../features/shell/dock-tabs";
import { PhoneTabs } from "../../features/shell/phone-tabs";

// iPhone keeps the native tab bar; Android gets Pawse's own dock.
export default function TabsLayout() {
  return Platform.OS === "android" ? <DockTabs /> : <PhoneTabs />;
}
