import { defineConfig } from "vitest/config";

// The thresholds of lag (docs/REVIEW.md §8.2). A run under them fails.
const LAG = { statements: 98, branches: 96, functions: 98, lines: 98 };

// The coverage run of the workspace: the tests of each package count toward the coverage of the four published
// packages. Each package has its own thresholds, so a gap in one package cannot hide behind another.
export default defineConfig({
  test: {
    projects: ["packages/core", "packages/domains", "packages/testkit", "packages/compiler", "packages/pilots"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts", "packages/domains/src/**/*.ts", "packages/testkit/src/**/*.ts", "packages/compiler/src/**/*.ts"],
      exclude: ["**/*.test.ts", "packages/core/src/test-support.ts", "packages/testkit/src/fc-setup.ts"],
      reporter: ["text-summary", "text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        ...LAG,
        "packages/core/src/**": LAG,
        "packages/domains/src/**": LAG,
        "packages/testkit/src/**": LAG,
        "packages/compiler/src/**": LAG,
      },
    },
  },
});
