// The home screen icons on offer: the paw in different finishes. The first is the default.
export const APP_ICONS = [
  {
    id: null,
    name: "Noir",
    preview: require("../../assets/images/app-icons/preview-noir.png"),
  },
  {
    id: "Midnight",
    name: "Midnight",
    preview: require("../../assets/images/app-icons/preview-midnight.png"),
  },
  {
    id: "Graphite",
    name: "Graphite",
    preview: require("../../assets/images/app-icons/preview-graphite.png"),
  },
] as const;

export type AppIconId = (typeof APP_ICONS)[number]["id"];
