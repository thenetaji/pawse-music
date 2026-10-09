import { type Href, router } from "expo-router";

// Detail pages exist under every tab; push them inside whichever tab is active so the tab bar stays.
type Tab = "home" | "explore" | "search" | "library";
let tab: Tab = "home";
export const setActiveTab = (t: Tab) => void (tab = t);

// A second tap on the same thing within a moment is ignored, so pages and sheets don't open twice.
let last = { href: "", at: 0 };
export function push(href: Href) {
  const key = JSON.stringify(href);
  const now = Date.now();
  if (key === last.href && now - last.at < 700) return;
  last = { href: key, at: now };
  router.push(href);
}

export const go = (path: `/${string}`) => push(`/(${tab})${path}` as Href);
