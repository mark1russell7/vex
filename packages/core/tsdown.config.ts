import { defineConfig } from "tsdown";

// The build of the package for npm: one ES module and its declarations in build/. The workspace uses the source.
export default defineConfig({
  entry: ["src/index.ts"],
  outDir: "build",
  format: "esm",
  platform: "neutral",
  // The type Optional comes from @mark1russell7/optional, a dev dependency: the declarations get a copy of it. The
  // helpers and the types of the documents come from @mark1russell7/coeval, also a dev dependency: the build copies the
  // part that the package uses. Thus the package has no runtime dependency.
  dts: { resolve: ["@mark1russell7/optional", "@mark1russell7/coeval"] },
  deps: { onlyBundle: ["@mark1russell7/optional", "@mark1russell7/coeval"] },
  sourcemap: true,
  publint: true,
  attw: { profile: "esm-only" },
});
