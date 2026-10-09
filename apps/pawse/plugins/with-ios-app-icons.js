// Alternate app icons on iOS only. expo-alternate-app-icons' Android half switches icons by
// disabling MainActivity, which the player notification opens, so only its iOS steps run here.
const {
  withAlternateAppIconsGenerator,
} = require("expo-alternate-app-icons/plugin/build/ios/withAlternateAppIconsGenerator");
const {
  withXcodeProjectUpdate,
} = require("expo-alternate-app-icons/plugin/build/ios/withXcodeProjectUpdate");
const {
  toPascalCaseIconName,
} = require("expo-alternate-app-icons/plugin/build/utils");

/** @param {{ name: string, ios: string }[]} icons */
module.exports = function withIosAppIcons(config, icons = []) {
  const alternates = icons.map(toPascalCaseIconName);
  config = withAlternateAppIconsGenerator(config, alternates);
  return withXcodeProjectUpdate(
    config,
    alternates.map((i) => i.name),
  );
};
