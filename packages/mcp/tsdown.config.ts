import { defineConfig } from "tsdown";

// The build of the package for npm: the library and the server entry, ES modules with declarations in build/. The
// workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts", "src/main.ts"],
  outDir: "build",
  format: "esm",
  platform: "node",
  fixedExtension: false,
  dts: true,
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
