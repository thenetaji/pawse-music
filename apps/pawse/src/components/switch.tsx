import { Switch as RNSwitch, StyleSheet, type SwitchProps } from "react-native";

const styles = StyleSheet.create({ center: { alignSelf: "center" } });

/** React Native pins the iOS switch to the top of its row with `alignSelf: flex-start`, so it is set back here. */
export function Switch({ style, ...props }: SwitchProps) {
  return <RNSwitch style={[styles.center, style]} {...props} />;
}
