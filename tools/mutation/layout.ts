// The layout of the copy of the lane. Stryker reads only the files under its working folder, so prepare.mjs copies
// each folder of COPIES into tools/mutation. A test file whose import does not find a file does not load. Vitest then
// reports no test of the file, and Stryker sees no failed test, so each mutant that the file kills survives. On
// 2026-11-03, three test files of the compiler imported "../../testkit/src/fc-timeout.ts", and the score of module.ts
// fell to 93.34 % (V-072). Thus the function unresolvedImports finds each relative import that the copy breaks.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

/** A copy of the lane. */
export interface Copy {
  /** This is the folder of the repository. */
  readonly from: string;
  /** This is the folder of the copy in tools/mutation. */
  readonly to: string;
  /** With true, the copy keeps the test files. */
  readonly tests: boolean;
}

/**
 * The copies of the lane: a folder of the repository (`from`), its folder in tools/mutation (`to`), and if the copy
 * keeps the test files. Stryker mutates the files of `work/` only. The other copies stay as they are.
 */
export const COPIES: readonly Copy[] = [
  // The sources and the tests of the four published packages.
  ...["core", "domains", "testkit", "compiler"].map((p) => ({ from: `packages/${p}/src`, to: `work/${p}`, tests: true })),
  // A standalone module copies the text of each op function. Stryker adds its counters to the functions of
  // work/domains, so the tests of the modules read a copy of the domains that Stryker does not mutate.
  { from: "packages/domains/src", to: "work/domains-plain", tests: false },
  // The tests of the fusion (module-fuse.test.ts) read the shapes pilot of ireko by the path "../../pilots/src".
  { from: "packages/pilots/src", to: "pilots/src", tests: false },
  // The tests of the compiler read propertyTimeout by the path "../../testkit/src/fc-timeout.ts".
  { from: "packages/testkit/src", to: "testkit/src", tests: false },
  // The tests of the compiler read the gate of the names by the path "../test/names.ts". Stryker does not mutate this copy.
  { from: "packages/compiler/test", to: "work/test", tests: false },
  // The files of that folder read the compiler by the path "../src". Stryker does not mutate this copy.
  { from: "packages/compiler/src", to: "work/src", tests: false },
];

/** A relative import or export of a module: `from "./x"`, `import "./x"` or `import("./x")`. */
const IMPORT = /(?:\bfrom|\bimport\(?)\s*["'](\.{1,2}\/[^"']+)["']/gu;

const isTest = (path: string): boolean => path.endsWith(".test.ts");

/**
 * This function gives each relative import of a copied file that finds no file in the copy, as `<file>: <import>`.
 * The file of a path of the copy is the file of the repository that a copy puts at that path.
 */
export function unresolvedImports(root: string): string[] {
  const lane = join(root, "tools", "mutation");
  const inCopy = (path: string): boolean =>
    COPIES.some((c) => {
      const rest = relative(join(lane, c.to), path);
      return rest !== "" && !rest.startsWith("..") && !isAbsolute(rest) && (c.tests || !isTest(path)) && existsSync(join(root, c.from, rest));
    });
  const out: string[] = [];
  for (const c of COPIES) {
    const files = readdirSync(join(root, c.from), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts") && (c.tests || !isTest(f)));
    for (const f of files) {
      for (const m of readFileSync(join(root, c.from, f), "utf8").matchAll(IMPORT)) {
        const target = m[1] ?? "";
        if (!inCopy(resolve(dirname(join(lane, c.to, f)), target))) out.push(`${c.from}/${f.replaceAll("\\", "/")}: ${target}`);
      }
    }
  }
  return out;
}
