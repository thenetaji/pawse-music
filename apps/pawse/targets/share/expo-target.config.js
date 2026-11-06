// Share extension: saves a shared Shazam link for the app and brings it forward. Bundle id = app id + ".share".
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "share",
  name: "Share",
  displayName: "Pawse",
  bundleIdentifier: ".share",
  deploymentTarget: "17.0",
  frameworks: ["UIKit", "UniformTypeIdentifiers"],
  entitlements: {
    "com.apple.security.application-groups":
      config.ios?.entitlements?.["com.apple.security.application-groups"] ?? [],
  },
});
