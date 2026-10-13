// The package check (docs/REVIEW.md §8.2, layer L8). This script packs each published package, checks the
// tarball with publint and attw, installs the tarballs in an empty project, and runs a program against them.
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const PACKAGES = ["core", "domains", "testkit", "compiler"];
const work = mkdtempSync(join(tmpdir(), "vex-pack-"));
// One command line with quoted arguments: pnpm and npm are scripts on Windows, so they need a shell.
/** @type {(cmd: string, args: readonly string[], cwd: string) => void} */
const run = (cmd, args, cwd) => execSync([cmd, ...args.map((a) => JSON.stringify(a))].join(" "), { cwd, stdio: "inherit" });

try {
  const tarballs = PACKAGES.map((p) => {
    const out = join(work, p);
    mkdirSync(out);
    run("pnpm", ["pack", "--pack-destination", out], join(root, "packages", p));
    const file = readdirSync(out).find((f) => f.endsWith(".tgz"));
    if (file === undefined) throw new Error(`no tarball for ${p}`);
    const tgz = join(out, file);
    run("pnpm", ["exec", "publint", "run", tgz, "--strict"], root);
    run("pnpm", ["exec", "attw", tgz, "--profile", "esm-only"], root);
    return tgz;
  });

  // An empty project that installs the tarballs, as a user installs the packages from npm.
  const app = join(work, "app");
  mkdirSync(app);
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "vex-smoke", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error", ...tarballs], app);
  writeFileSync(
    join(app, "smoke.mjs"),
    `import { space, vex } from "@mark1russell7/vex";
import { NumDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { checkLaws } from "@mark1russell7/vex-testkit";
import { tiered } from "@mark1russell7/vex-compiler";
import * as fc from "fast-check";

const box = (x, y) => ({ position: new Vec2(x, y) });
const root = vex(Vec2Domain, NumDomain).over(space.record({ A: box(0, 0), B: box(3, 4), C: box(6, 8) }));
const nearest = root.from("position").others((e) => e._.subtract("position")._.length()).min();
const result = nearest.result("A");
if (!result.ok || result.value !== 5) throw new Error("the nearest-box program gave " + JSON.stringify(result));
const compiled = tiered(nearest.program, { domains: [Vec2Domain, NumDomain] });
const fast = compiled.run({ space: root.space, origin: "A" });
if (compiled.tier !== 2 || !fast.ok || fast.value !== 5) throw new Error("the compiled program gave " + JSON.stringify(fast));
const failed = checkLaws(NumDomain, { arb: fc.integer({ min: -100, max: 100 }), numRuns: 50 }).filter((r) => !r.ok);
if (failed.length > 0) throw new Error("law failures: " + JSON.stringify(failed));
console.info("package check: the tarballs install, import and run");
`,
  );
  run("node", ["smoke.mjs"], app);
  // The type Optional comes from a dev dependency, so the declarations must hold a copy of it, not an import.
  const dts = readFileSync(join(app, "node_modules/@mark1russell7/vex/build/index.d.ts"), "utf8");
  if (dts.includes('"@mark1russell7/optional"')) throw new Error("the declarations of @mark1russell7/vex import @mark1russell7/optional");
} finally {
  rmSync(work, { recursive: true, force: true });
}
