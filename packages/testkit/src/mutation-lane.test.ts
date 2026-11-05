import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * This function gives the root of the repository: the first folder above this file that holds `pnpm-workspace.yaml`.
 * The mutation lane runs a copy of this file in `tools/mutation/.stryker-tmp`.
 */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("The folders above this file do not hold pnpm-workspace.yaml.");
    dir = up;
  }
  return dir;
}

/** The name of the configuration of the tests of a package. */
const CONFIG = "vitest.config.ts";

/** The part of `tools/mutation/layout.ts` that this test reads. */
interface Layout {
  readonly unresolvedImports: (root: string) => readonly string[];
  readonly missingPackages: (root: string) => readonly string[];
  readonly missingSetups: (root: string) => readonly string[];
}

describe("the copy of the mutation lane", () => {
  // A test file whose import finds no file does not load in the lane. Stryker sees no failed test, so each mutant
  // that the file kills survives. On 2026-11-03, three test files of the compiler did not load.
  it("V-072: each relative import of a file of the copy finds a file of the copy", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.unresolvedImports(root)).toEqual([]);
  });

  // The printer imports `acorn` and `astring`, and on 2026-11-05 the lane did not have these packages. Each test file of the printer
  // did not load, so the lane read 69.13 %, and that figure was no reading.
  it("V-090: each import of a package by a file of the copy finds a package of the lane", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.missingPackages(root)).toEqual([]);
  });

  // The configuration of the compiler loads `module-fault.setup.ts`, and on 2026-11-05 the lane did not load it. So the
  // tests of a module printed other code in the lane than in CI, and one test failed at the dry run of Stryker.
  it("V-091: each setup file of a package with tests in the copy is a setup file of the lane", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    expect(layout.missingSetups(root)).toEqual([]);
  });

  it("V-091: the check names a setup file that the lane does not load", async () => {
    const root = repoRoot();
    const layout = (await import(pathToFileURL(join(root, "tools", "mutation", "layout.ts")).href)) as Layout;
    const other = mkdtempSync(join(tmpdir(), "vex-lane-"));
    mkdirSync(join(other, "packages", "compiler"), { recursive: true });
    const config = join(other, "packages", "compiler", CONFIG);
    writeFileSync(config, 'export default { test: { setupFiles: ["../testkit/src/fc-setup.ts", "./src/not-in-the-lane.ts"] } };\n');
    const found = layout.missingSetups(other);
    rmSync(other, { recursive: true });
    expect(found).toEqual([`packages/compiler/${CONFIG}: compiler/not-in-the-lane.ts`]);
  });
});
