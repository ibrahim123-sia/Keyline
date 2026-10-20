import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/next-mocks.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/global-db.ts"],
          setupFiles: ["tests/setup/next-mocks.ts", "tests/setup/integration.ts"],
          // One shared database: run files one after another.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
