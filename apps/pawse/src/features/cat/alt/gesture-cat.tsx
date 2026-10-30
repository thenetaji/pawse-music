import { Lottie } from "../../../components/lottie";
import { DANCES } from "./dances";

/** A small looping cat that shows up with a gesture's feedback; each gesture has its own. */
export function GestureCat({
  dance,
  size,
  flip,
}: {
  dance: string;
  size: number;
  flip?: boolean;
}) {
  const d = DANCES.find((x) => x.id === dance);
  if (!d) return null;
  return <Lottie source={d.load()} size={size} flip={flip} autoPlay />;
}
