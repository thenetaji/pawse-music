import { Spinner } from "./spinner";

// lottie-react-native's web build needs a package we don't ship.
export function CatSpinner({ size }: { size: number }) {
  return <Spinner size={size} />;
}
