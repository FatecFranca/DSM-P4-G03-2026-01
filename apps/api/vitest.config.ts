import { defineConfig } from "vitest/config";

const testDbUrl =
  process.env.DATABASE_URL ?? "postgresql://127.0.0.1:5432/protecther_test";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    env: {
      DATABASE_URL: testDbUrl,
      JWT_SECRET: process.env.JWT_SECRET ?? "vitest-jwt-secret-minimum-16chars",
    },
  },
});
