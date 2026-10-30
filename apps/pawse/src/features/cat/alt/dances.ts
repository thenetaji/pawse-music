import type { AnimationObject } from "lottie-react-native";

export type Dance = {
  id: string;
  load: () => AnimationObject;
  /** Empty space under the feet, as a share of the picture's height; the cat is moved down by this to stand on the wire. */
  lift: number;
  /** For a cat drawn small inside its picture. */
  scale?: number;
};

// Each is loaded the first time it comes up, so the ones never shown cost nothing at startup.
export const DANCES: Dance[] = [
  {
    id: "mochi",
    load: () => require("../../../../assets/cats/dances/mochi.json"),
    lift: 0.12,
  },
  {
    id: "night",
    load: () => require("../../../../assets/cats/dances/night.json"),
    lift: 0,
  },
  {
    id: "party",
    load: () => require("../../../../assets/cats/dances/party.json"),
    lift: 0.08,
  },
  {
    id: "confetti",
    load: () => require("../../../../assets/cats/dances/confetti.json"),
    lift: 0.08,
  },
  {
    id: "giggle",
    load: () => require("../../../../assets/cats/dances/giggle.json"),
    lift: 0.25,
    scale: 1.5,
  },
  {
    id: "rainbow",
    load: () => require("../../../../assets/cats/dances/rainbow.json"),
    lift: 0.05,
  },
  {
    id: "box",
    load: () => require("../../../../assets/cats/dances/box.json"),
    lift: 0,
  },
  {
    id: "pounce",
    load: () => require("../../../../assets/cats/dances/pounce.json"),
    lift: 0.02,
  },
  {
    id: "poses",
    load: () => require("../../../../assets/cats/dances/poses.json"),
    lift: 0.14,
  },
  {
    id: "snack",
    load: () => require("../../../../assets/cats/dances/snack.json"),
    lift: 0,
  },
  {
    id: "moon",
    load: () => require("../../../../assets/cats/dances/moon.json"),
    lift: 0,
  },
];

/** Any dance but the one showing, so a new song always brings new steps. */
export function nextDance(current: number, random = Math.random): number {
  const pick = Math.floor(random() * (DANCES.length - 1));
  return pick >= current ? pick + 1 : pick;
}
