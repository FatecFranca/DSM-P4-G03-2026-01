import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  define: {
    /* React Native injeta __DEV__ no bundle; fora do Metro precisamos declarar. */
    __DEV__: false,
  },
});
