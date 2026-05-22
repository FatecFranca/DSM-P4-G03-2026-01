export const JWT_EXPIRES_SECONDS = Number(
  process.env.JWT_EXPIRES_SECONDS ?? 60 * 60 * 24 * 7,
);

export function isNonProductionNodeEnv(): boolean {
  const env = process.env.NODE_ENV ?? "development";
  return env !== "production";
}
