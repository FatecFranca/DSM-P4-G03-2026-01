import type { ConfigContext, ExpoConfig } from "expo/config";
import discreetIcons from "./src/appearance/discreetIcons.json";

// O app nasce com o ícone e o nome originais (disfarce padrão = "original"). Os demais
// disfarces só valem se o usuário escolhê-los em Aparência.
const defaultDiscreetIcon = discreetIcons.icons.find(
  (icon) => icon.key === discreetIcons.defaultKey,
);

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const locationForegroundIntervalMs = Number(
    process.env.EXPO_PUBLIC_LOCATION_FG_INTERVAL_MS ?? 5000,
  );
  const locationBackgroundIntervalMs = Number(
    process.env.EXPO_PUBLIC_LOCATION_BG_INTERVAL_MS ?? 15_000,
  );

  return {
    ...config,
    name: defaultDiscreetIcon?.label ?? "ProtectHer",
    slug: "protecther-mobile",
    // Deep link da ação rápida "Ocultar app" (ver plugins/withDiscreetIcons.js).
    scheme: "protecther",
    ios: {
      ...config.ios,
      bundleIdentifier:
        process.env.EXPO_IOS_BUNDLE_IDENTIFIER ?? "com.protecther.app",
      infoPlist: {
        ...config.ios?.infoPlist,
        NSLocalNetworkUsageDescription:
          "O app precisa acessar a API de desenvolvimento na sua rede local.",
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
        UIBackgroundModes: [
          ...new Set([
            ...((config.ios?.infoPlist as { UIBackgroundModes?: string[] })
              ?.UIBackgroundModes ?? []),
            "location",
          ]),
        ],
        NSBluetoothAlwaysUsageDescription:
          "O Bluetooth é usado para conectar ao botão físico ESP32 via BLE.",
        NSBluetoothPeripheralUsageDescription:
          "O Bluetooth é usado para conectar ao botão físico ESP32 via BLE.",
      },
    },
    android: {
      ...config.android,
      package: config.android?.package ?? "com.protecther.app",
      googleServicesFile:
        process.env.GOOGLE_SERVICES_FILE ?? "./google-services.json",
      permissions: [
        ...new Set([
          ...(config.android?.permissions ?? []),
          "ACCESS_COARSE_LOCATION",
          "ACCESS_FINE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "BLUETOOTH_SCAN",
          "BLUETOOTH_CONNECT",
          "BLUETOOTH_ADVERTISE",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
          "POST_NOTIFICATIONS",
        ]),
      ],
    },
    plugins: [
      "./plugins/withDiscreetIcons",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Localização é usada durante um alerta ativo para avisar seus contatos.",
          locationAlwaysAndWhenInUsePermission:
            "Com 'Sempre', o app pode enviar sua posição mesmo em segundo plano durante o alerta.",
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      [
        "expo-notifications",
        {
          defaultChannel: "alerts",
          color: "#E11D48",
        },
      ],
    ],
    extra: {
      ...config.extra,
      apiUrl,
      locationForegroundIntervalMs: Number.isFinite(
        locationForegroundIntervalMs,
      )
        ? Math.min(Math.max(locationForegroundIntervalMs, 3000), 60_000)
        : 10_000,
      locationBackgroundIntervalMs: Number.isFinite(
        locationBackgroundIntervalMs,
      )
        ? Math.min(Math.max(locationBackgroundIntervalMs, 5000), 120_000)
        : 15_000,
    },
  };
};
