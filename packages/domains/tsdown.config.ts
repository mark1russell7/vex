import { defineConfig } from "tsdown";

// The build of the package for npm: one ES module for each entry, and its declarations, in build/. The workspace uses the
// source. The entry quantity is apart, so a bundle without amounts does not get the unit tables of @mark1russell7/quantity.
export default defineConfig({
  entry: ["src/index.ts", "src/quantity.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  dts: true,
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
