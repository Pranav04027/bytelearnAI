import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["src/test/setup.js"],
    include: ["src/test/**/*.test.js"],
    clearMocks: true
  }
});