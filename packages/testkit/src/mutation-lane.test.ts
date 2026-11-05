import { existsSync } from "node:fs";
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

/** The part of `tools/mutation/layout.ts` that this test reads. */
interface Layout {
  readonly unresolvedImports: (root: string) => readonly string[];
  readonly missingPackages: (root: string) => readonly string[];
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
});
