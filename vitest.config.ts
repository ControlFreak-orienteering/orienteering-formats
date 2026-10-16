import { defineConfig } from "vitest/config";

// The map reader's tests are TypeScript next to the code (src/**/*.test.ts). The format
// tests in test/ run on the built dist/ with node --test, as before.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
