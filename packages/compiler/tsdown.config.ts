import { defineConfig } from "tsdown";

// The build of the package for npm: two ES modules and their declarations in build/. The workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts", "src/module-entry.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
