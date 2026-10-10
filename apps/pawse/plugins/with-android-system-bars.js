// Edge-to-edge keeps a grey contrast scrim behind 3-button navigation unless the theme opts out;
// turn it off so the AMOLED black runs under the nav bar.
const { AndroidConfig, withAndroidStyles } = require("expo/config-plugins");

module.exports = function withAndroidSystemBars(config) {
  return withAndroidStyles(config, (c) => {
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, {
      add: true,
      parent,
      name: "android:enforceNavigationBarContrast",
      value: "false",
    });
    return c;
  });
};
