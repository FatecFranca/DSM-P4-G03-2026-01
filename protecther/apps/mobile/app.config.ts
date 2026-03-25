import type { ConfigContext, ExpoConfig } from "expo/config";

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
    name: "ProtectHer",
    slug: "protecther-mobile",
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        UIBackgroundModes: [
          ...new Set([
            ...((config.ios?.infoPlist as { UIBackgroundModes?: string[] })
              ?.UIBackgroundModes ?? []),
            "location",
          ]),
        ],
      },
    },
    android: {
      ...config.android,
      permissions: [
        ...new Set([
          ...(config.android?.permissions ?? []),
          "ACCESS_COARSE_LOCATION",
          "ACCESS_FINE_LOCATION",
          "ACCESS_BACKGROUND_LOCATION",
          "FOREGROUND_SERVICE",
          "FOREGROUND_SERVICE_LOCATION",
          "POST_NOTIFICATIONS",
        ]),
      ],
    },
    plugins: [
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Localização é usada durante um alerta ativo para avisar seus contatos.",
          locationAlwaysAndWhenInUsePermission:
            "Com “Sempre”, o app pode enviar sua posição mesmo em segundo plano durante o alerta.",
          isAndroidBackgroundLocationEnabled: true,
        },
      ],
      "expo-notifications",
    ],
    extra: {
      ...config.extra,
      apiUrl,
      locationForegroundIntervalMs: Number.isFinite(
        locationForegroundIntervalMs,
      )
        ? Math.min(Math.max(locationForegroundIntervalMs, 3000), 60_000)
        : 5000,
      locationBackgroundIntervalMs: Number.isFinite(
        locationBackgroundIntervalMs,
      )
        ? Math.min(Math.max(locationBackgroundIntervalMs, 5000), 120_000)
        : 15_000,
    },
  };
};
