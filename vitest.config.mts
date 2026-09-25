import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    hookTimeout: 60_000,
    testTimeout: 20_000,
    // Na wspólnym Postgresie (REGISTRY_TEST_DATABASE_URL) pliki nie mogą czyścić bazy równolegle.
    fileParallelism: !process.env.REGISTRY_TEST_DATABASE_URL,
  },
});
