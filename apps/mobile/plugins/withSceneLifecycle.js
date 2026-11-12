/**
 * Adota UIScene no iOS para evitar o encerramento de apps sem ciclo de vida de cena.
 * O iOS 27 exige UIScene para apps compilados com o SDK atual.
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require("expo/config-plugins");

const SCENE_DELEGATE = `import UIKit
import React

@MainActor
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
    self.window = window
    window.makeKeyAndVisible()
  }
}
`;

module.exports = function withSceneLifecycle(config) {
  const withSceneManifest = withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });

  const withSceneAppDelegate = withDangerousMod(withSceneManifest, [
    "ios",
    (cfg) => {
      const appDelegatePath = path.join(
        cfg.modRequest.platformProjectRoot,
        "ProtectHer",
        "AppDelegate.swift",
      );
      let source = fs.readFileSync(appDelegatePath, "utf8");
      if (!source.includes("var launchOptions:")) {
        source = source.replace(
          "  var window: UIWindow?\n",
          "  var window: UIWindow?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n",
        );
      }
      if (!source.includes("self.launchOptions = launchOptions")) {
        source = source.replace(
          "    let delegate = ReactNativeDelegate()\n",
          "    self.launchOptions = launchOptions\n    let delegate = ReactNativeDelegate()\n",
        );
      }
      const legacyWindowStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
      if (source.includes(legacyWindowStartup)) {
        source = source.replace(legacyWindowStartup, "");
      } else if (source.includes("UIWindow(frame: UIScreen.main.bounds)")) {
        throw new Error(
          "[withSceneLifecycle] AppDelegate usa um startup não reconhecido; não foi alterado.",
        );
      }
      fs.writeFileSync(appDelegatePath, source);
      return cfg;
    },
  ]);

  return withXcodeProject(withSceneAppDelegate, (cfg) => {
    const { projectName, platformProjectRoot } = cfg.modRequest;
    const filepath = path.join(
      platformProjectRoot,
      projectName,
      "SceneDelegate.swift",
    );
    fs.writeFileSync(filepath, SCENE_DELEGATE);
    IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
      filepath: path.join(projectName, "SceneDelegate.swift"),
      groupName: projectName,
      project: cfg.modResults,
    });
    return cfg;
  });
};
