import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@raycast/api": resolve(__dirname, "src/__tests__/mocks/raycast-api.ts"),
    },
  },
});
