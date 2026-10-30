import { defineConfig } from "tsdown";

// The build of the package for npm: one ES module and its declarations in build/. The workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  // @mark1russell7/coeval, the kernel of the family, is the one runtime dependency (decision D13 in docs/REVIEW.md). The
  // build does not copy it, so a program has one kernel and one brand of its host things.
  // The type Optional comes from @mark1russell7/optional, a dev dependency: onlyBundle copies it into the declarations.
  deps: { onlyBundle: ["@mark1russell7/optional"] },
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
