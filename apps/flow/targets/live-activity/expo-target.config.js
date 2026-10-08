// One widget extension: the Live Activity (Dynamic Island + Lock Screen). Bundle id = app id + ".liveactivity".
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'LiveActivity',
  displayName: 'Flow',
  bundleIdentifier: '.liveactivity',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [],
  },
});
