import { useWindowDimensions } from "react-native";

import {
  DESKTOP_MIN_WIDTH,
  DesktopShell,
} from "../../features/shell/desktop-shell";
import { DockTabs } from "../../features/shell/dock-tabs";

// The desktop app and wide browser windows get a sidebar; narrow ones keep the phone tabs.
export default function WebTabs() {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_MIN_WIDTH ? <DesktopShell /> : <DockTabs />;
}
