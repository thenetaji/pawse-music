// Adopts UIKit's scene-based life cycle, which iOS 27 enforces for apps built with its SDK:
// without it the app aborts at launch in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption.
// Expo SDK 57 ships ExpoAppSceneDelegate, but its bare template still creates the window in the app
// delegate. This mirrors the SDK 58 template: a SceneDelegate subclass, a scene manifest, and an app
// delegate that only builds the React Native factory. Remove this plugin after upgrading to SDK 58.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = `
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const WINDOW_START =
  /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function adoptScenes(source) {
  if (source.includes('class SceneDelegate')) return source;
  const next = source
    .replace('class AppDelegate: ExpoAppDelegate {', 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {')
    .replace(WINDOW_START, '    // SceneDelegate creates the window and starts React Native under the scene life cycle.\n');
  if (!next.includes('ExpoReactNativeFactoryProvider {') || next.includes('UIWindow(frame:')) {
    throw new Error('with-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template; update this plugin.');
  }
  return next + SCENE_DELEGATE;
}

function withSceneLifecycle(config) {
  config = withInfoPlist(config, (mod) => {
    mod.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return mod;
  });
  return withAppDelegate(config, (mod) => {
    if (mod.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle expects a Swift AppDelegate.');
    }
    mod.modResults.contents = adoptScenes(mod.modResults.contents);
    return mod;
  });
}

module.exports = withSceneLifecycle;
module.exports.adoptScenes = adoptScenes;
