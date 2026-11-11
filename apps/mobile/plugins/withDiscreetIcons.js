/**
 * Config plugin: ícones discretos (disfarces) para Android e iOS.
 *
 * Fonte da verdade: src/appearance/discreetIcons.json (+ assets/discreet-icons/<chave>/*,
 * gerados por scripts/generate-discreet-icons.py).
 *
 * Android
 *  - tira o LAUNCHER da MainActivity e cria um <activity-alias> por disfarce
 *    (ícone adaptativo + monocromático + legado, e rótulo próprio);
 *  - só o alias padrão nasce habilitado; o módulo nativo `DiscreetIcon` alterna em runtime.
 *
 * iOS
 *  - copia os PNGs para o projeto Xcode e registra CFBundleAlternateIcons.
 *  - o ícone principal (AppIcon) é o disfarce padrão (config `icon` do app).
 */
const fs = require("node:fs");
const path = require("node:path");
const {
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  withXcodeProject,
  IOSConfig,
} = require("expo/config-plugins");

const projectRoot = path.resolve(__dirname, "..");
const catalog = require("../src/appearance/discreetIcons.json");

const ASSETS_DIR = path.join(projectRoot, "assets", "discreet-icons");
const ALIAS_MARKER = ".discreet.";
const LEGACY_DENSITIES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

const resName = (key) => `ic_discreet_${key}`;
const iosBase = (key) => `discreet-${key}`;

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function assertAssets() {
  for (const { key } of catalog.icons) {
    for (const file of [
      "android-foreground.png",
      "android-background.png",
      "android-monochrome.png",
      "ios-120.png",
      "ios-180.png",
      "ios-152.png",
      "ios-167.png",
    ]) {
      if (!fs.existsSync(path.join(ASSETS_DIR, key, file))) {
        throw new Error(
          `[withDiscreetIcons] asset ausente: ${key}/${file}. Rode scripts/generate-discreet-icons.py`,
        );
      }
    }
  }
}

/* ------------------------------- Android ------------------------------- */

function withAndroidAliases(baseConfig) {
  const androidPackage = baseConfig.android?.package;
  if (!androidPackage) {
    throw new Error("[withDiscreetIcons] defina expo.android.package");
  }

  const withManifest = withAndroidManifest(baseConfig, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    if (!app) {
      return cfg;
    }

    const mainActivity = (app.activity ?? []).find(
      (a) => a.$["android:name"] === ".MainActivity",
    );
    if (!mainActivity) {
      throw new Error("[withDiscreetIcons] MainActivity não encontrada");
    }

    // O launcher passa a ser responsabilidade exclusiva dos aliases.
    mainActivity["intent-filter"] = (
      mainActivity["intent-filter"] ?? []
    ).filter(
      (filter) =>
        !(filter.category ?? []).some(
          (c) => c.$["android:name"] === "android.intent.category.LAUNCHER",
        ),
    );

    const aliases = (app["activity-alias"] ?? []).filter(
      (a) => !a.$["android:name"].includes(ALIAS_MARKER),
    );
    for (const icon of catalog.icons) {
      aliases.push({
        $: {
          "android:name": `${androidPackage}${ALIAS_MARKER}${icon.key}`,
          "android:targetActivity": ".MainActivity",
          "android:enabled": String(icon.key === catalog.defaultKey),
          "android:exported": "true",
          "android:icon": `@mipmap/${resName(icon.key)}`,
          "android:label": icon.label,
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
            category: [
              { $: { "android:name": "android.intent.category.LAUNCHER" } },
            ],
          },
        ],
      });
    }
    app["activity-alias"] = aliases;
    return cfg;
  });

  return withDangerousMod(withManifest, [
    "android",
    (cfg) => {
      const res = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      for (const { key } of catalog.icons) {
        const src = path.join(ASSETS_DIR, key);
        const name = resName(key);

        for (const layer of ["foreground", "background", "monochrome"]) {
          copyFile(
            path.join(src, `android-${layer}.png`),
            path.join(res, "drawable-nodpi", `${name}_${layer}.png`),
          );
        }
        for (const [density, size] of Object.entries(LEGACY_DENSITIES)) {
          copyFile(
            path.join(src, `legacy-${size}.png`),
            path.join(res, `mipmap-${density}`, `${name}.png`),
          );
        }

        const adaptive = path.join(res, "mipmap-anydpi-v26", `${name}.xml`);
        fs.mkdirSync(path.dirname(adaptive), { recursive: true });
        fs.writeFileSync(
          adaptive,
          `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/${name}_background"/>
    <foreground android:drawable="@drawable/${name}_foreground"/>
    <monochrome android:drawable="@drawable/${name}_monochrome"/>
</adaptive-icon>
`,
        );
      }
      return cfg;
    },
  ]);
}

/* --------------------------------- iOS --------------------------------- */

function alternateIconKeys() {
  // O disfarce padrão é o ícone principal (AppIcon), não um alternativo.
  return catalog.icons.filter((i) => i.key !== catalog.defaultKey);
}

function withIosAlternateIcons(baseConfig) {
  const withProject = withXcodeProject(baseConfig, (cfg) => {
    const { projectName, platformProjectRoot } = cfg.modRequest;
    const destDir = path.join(
      platformProjectRoot,
      projectName,
      "DiscreetIcons",
    );
    fs.rmSync(destDir, { recursive: true, force: true });

    for (const { key } of alternateIconKeys()) {
      const base = iosBase(key);
      const src = path.join(ASSETS_DIR, key);
      const files = {
        [`${base}-60@2x.png`]: "ios-120.png",
        [`${base}-60@3x.png`]: "ios-180.png",
        [`${base}-76@2x.png`]: "ios-152.png",
        [`${base}-83@2x.png`]: "ios-167.png",
      };
      for (const [dest, from] of Object.entries(files)) {
        copyFile(path.join(src, from), path.join(destDir, dest));
        IOSConfig.XcodeUtils.addResourceFileToGroup({
          filepath: path.join(projectName, "DiscreetIcons", dest),
          groupName: projectName,
          project: cfg.modResults,
          isBuildFile: true,
          verbose: false,
        });
      }
    }
    return cfg;
  });

  return withInfoPlist(withProject, (cfg) => {
    const alternates = {};
    const alternatesIpad = {};
    for (const { key } of alternateIconKeys()) {
      const base = iosBase(key);
      alternates[key] = {
        CFBundleIconFiles: [`${base}-60`],
        UIPrerenderedIcon: false,
      };
      alternatesIpad[key] = {
        CFBundleIconFiles: [`${base}-76`, `${base}-83`],
        UIPrerenderedIcon: false,
      };
    }
    const primary = {
      CFBundleIconFiles: ["AppIcon"],
      CFBundleIconName: "AppIcon",
    };
    cfg.modResults.CFBundleIcons = {
      CFBundlePrimaryIcon: primary,
      CFBundleAlternateIcons: alternates,
    };
    cfg.modResults["CFBundleIcons~ipad"] = {
      CFBundlePrimaryIcon: primary,
      CFBundleAlternateIcons: alternatesIpad,
    };
    return cfg;
  });
}

/* -------------------------------- Plugin -------------------------------- */

module.exports = function withDiscreetIcons(config) {
  assertAssets();
  return withIosAlternateIcons(withAndroidAliases(config));
};
