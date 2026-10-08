import { type Href, router } from "expo-router";

// Detail pages exist under every tab; push them inside whichever tab is active so the tab bar stays.
type Tab = "home" | "explore" | "search" | "library";
let tab: Tab = "home";
export const setActiveTab = (t: Tab) => void (tab = t);
export const go = (path: `/${string}`) =>
  router.push(`/(${tab})${path}` as Href);
