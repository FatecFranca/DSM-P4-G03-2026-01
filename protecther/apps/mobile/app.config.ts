import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const locationIntervalMs = Number(
    process.env.EXPO_PUBLIC_LOCATION_INTERVAL_MS ?? 15_000,
  );

  return {
    ...config,
    name: "ProtectHer",
    slug: "protecther-mobile",
    plugins: [
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Localização é usada só durante um alerta ativo para avisar seus contatos.",
        },
      ],
    ],
    extra: {
      ...config.extra,
      apiUrl,
      locationIntervalMs: Number.isFinite(locationIntervalMs)
        ? Math.min(Math.max(locationIntervalMs, 5000), 120_000)
        : 15_000,
    },
  };
};
