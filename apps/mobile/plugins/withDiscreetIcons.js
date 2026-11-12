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
 *  - rota de volta: tile nas Configurações Rápidas (OpenAppTileService) + código do discador.
 *  - "ocultar app" = todos os aliases desabilitados (sem LAUNCHER nem INFO, senão o
 *    launcher ainda lista o app). Ação rápida (long-press) "Ocultar app"
 *    via static shortcut + receiver do código secreto (secretCode) para voltar.
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
const TILE_SERVICE = "expo.modules.discreeticon.OpenAppTileService";
const TILE_LABEL = "ProtectHer";
const SECRET_CODE_RECEIVER = "expo.modules.discreeticon.SecretCodeReceiver";
// Precisa bater com `scheme` (app.config.ts) e com o linking de RootNavigator.
const DEEP_LINK_HIDE = "protecther://appearance?hide=1";
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
      (a) =>
        !a.$["android:name"].includes(ALIAS_MARKER) &&
        // legado: alias INFO de uma versão anterior (o launcher o listava como ícone)
        !a.$["android:name"].endsWith(".RecoveryEntry"),
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
        // Ação rápida ao segurar o ícone: "Ocultar app".
        "meta-data": [
          {
            $: {
              "android:name": "android.app.shortcuts",
              "android:resource": "@xml/discreet_shortcuts",
            },
          },
        ],
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

    // Rota de volta principal com o app oculto: tile nas Configurações Rápidas que abre o app.
    app.service = (app.service ?? []).filter(
      (s) => s.$["android:name"] !== TILE_SERVICE,
    );
    app.service.push({
      $: {
        "android:name": TILE_SERVICE,
        "android:exported": "true",
        "android:label": "@string/discreet_tile_label",
        "android:icon": "@drawable/ic_discreet_tile",
        "android:permission": "android.permission.BIND_QUICK_SETTINGS_TILE",
      },
      "intent-filter": [
        {
          action: [
            {
              $: {
                "android:name": "android.service.quicksettings.action.QS_TILE",
              },
            },
          ],
        },
      ],
    });

    // Rota extra: discar *#*#<código>#*#* no app Telefone.
    app.receiver = (app.receiver ?? []).filter(
      (r) => r.$["android:name"] !== SECRET_CODE_RECEIVER,
    );
    app.receiver.push({
      $: {
        "android:name": SECRET_CODE_RECEIVER,
        "android:exported": "true",
      },
      "intent-filter": [
        {
          action: [
            {
              $: { "android:name": "android.provider.Telephony.SECRET_CODE" },
            },
          ],
          data: [
            {
              $: {
                "android:scheme": "android_secret_code",
                "android:host": catalog.secretCode,
              },
            },
          ],
        },
      ],
    });
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
      // Atalho estático (long-press): abre Aparência pedindo a confirmação para ocultar.
      const shortcuts = path.join(res, "xml", "discreet_shortcuts.xml");
      fs.mkdirSync(path.dirname(shortcuts), { recursive: true });
      fs.writeFileSync(
        shortcuts,
        `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="hide_app"
        android:enabled="true"
        android:shortcutShortLabel="@string/discreet_shortcut_hide_short"
        android:shortcutLongLabel="@string/discreet_shortcut_hide_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:data="${DEEP_LINK_HIDE}"
            android:targetPackage="${androidPackage}"
            android:targetClass="${androidPackage}.MainActivity"/>
    </shortcut>
</shortcuts>
`,
      );
      const strings = path.join(res, "values", "discreet_shortcuts.xml");
      fs.mkdirSync(path.dirname(strings), { recursive: true });
      fs.writeFileSync(
        strings,
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="discreet_shortcut_hide_short">Ocultar app</string>
    <string name="discreet_shortcut_hide_long">Ocultar app da tela inicial</string>
    <string name="discreet_tile_label">${TILE_LABEL}</string>
</resources>
`,
      );

      const tileIcon = path.join(res, "drawable", "ic_discreet_tile.xml");
      fs.mkdirSync(path.dirname(tileIcon), { recursive: true });
      fs.writeFileSync(
        tileIcon,
        `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="#FFFFFFFF"
        android:pathData="M12,2L4,5v6c0,5.55 3.84,10.74 8,12 4.16,-1.26 8,-6.45 8,-12V5L12,2z"/>
</vector>
`,
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
