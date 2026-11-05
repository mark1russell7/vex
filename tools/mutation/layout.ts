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
  /** The start of a relative import that the copy changes, and its new start. */
  readonly imports?: readonly [string, string];
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
  // The files of that folder read the compiler by the path "../src/". The setup file mocks "../src/module.ts", and a mock
  // holds only for the file that a test imports. So in the lane, these files read the compiler of the tests (V-091).
  { from: "packages/compiler/test", to: "work/test", tests: false, imports: ['"../src/', '"../compiler/'] },
];

/**
 * The setup files of the tests of the lane, as paths in `work/`. A test of the lane must read what the same test reads in
 * CI. On 2026-11-05 the lane did not load `module-fault.setup.ts`, so each test of a module printed other code (V-091).
 */
export const SETUP_FILES: readonly string[] = ["testkit/fc-setup.ts", "test/module-fault.setup.ts"];

/** A relative import or export of a module: `from "./x"`, `import "./x"` or `import("./x")`. */
const IMPORT = /(?:\bfrom|\bimport\(?)\s*["'](\.{1,2}\/[^"']+)["']/gu;

const isTest = (path: string): boolean => path.endsWith(".test.ts");

/** This function gives the text of a file in the copy, with the change of its imports. */
export function textInCopy(copy: Copy, text: string): string {
  return copy.imports === undefined ? text : text.replaceAll(copy.imports[0], copy.imports[1]);
}

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
      for (const m of textInCopy(c, readFileSync(join(root, c.from, f), "utf8")).matchAll(IMPORT)) {
        const target = m[1] ?? "";
        if (!inCopy(resolve(dirname(join(lane, c.to, f)), target))) out.push(`${c.from}/${f.replaceAll("\\", "/")}: ${target}`);
      }
    }
  }
  return out;
}

/** A package that an alias of `vitest.config.ts` gives to the lane. */
const ALIASED = new Set(["@mark1russell7/vex"]);

/** An import of a value from a package. An import of a type goes away, and it needs no package at the load. */
const PACKAGE_IMPORT = /^(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^."'][^"']*)["']/gmu;

/** This function gives the name of the package of an import: `a/b` is `a`, and `@a/b/c` is `@a/b`. */
const packageOf = (specifier: string): string => specifier.split("/").slice(0, specifier.startsWith("@") ? 2 : 1).join("/");

/**
 * This function gives each import of a package by a file of a published package that the lane does not have, as
 * `<file>: <package>`. The lane has the packages of `tools/mutation/package.json`, the built-in modules of Node.js and
 * the aliases. A test loads only some files of the other copies, so `load-check.ts` reads those files.
 */
export function missingPackages(root: string): string[] {
  const lane = JSON.parse(readFileSync(join(root, "tools", "mutation", "package.json"), "utf8")) as {
    readonly dependencies: Readonly<Record<string, string>>;
    readonly devDependencies: Readonly<Record<string, string>>;
  };
  const has = new Set([...Object.keys(lane.dependencies), ...Object.keys(lane.devDependencies), ...ALIASED]);
  const out: string[] = [];
  for (const c of COPIES.filter((copy) => copy.tests)) {
    const files = readdirSync(join(root, c.from), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      for (const m of readFileSync(join(root, c.from, f), "utf8").matchAll(PACKAGE_IMPORT)) {
        const name = packageOf(m[1] ?? "");
        if (!name.startsWith("node:") && !has.has(name)) out.push(`${c.from}/${f.replaceAll("\\", "/")}: ${name}`);
      }
    }
  }
  return out;
}

/** The name of the configuration of the tests of a package. */
const CONFIG_FILE = "vitest.config.ts";

/** The list of the setup files in the configuration of the tests of a package. */
const SETUP_LIST = /setupFiles:\s*\[([^\]]*)\]/u;

/** A path in quotes. */
const QUOTED = /["']([^"']+)["']/gu;

/** This function gives the path in `work/` of a file of the repository, or the path of the file when no copy holds it. */
function pathInLane(file: string): string {
  const copy = COPIES.find((c) => file.startsWith(`${c.from}/`) && c.to.startsWith("work/"));
  return copy === undefined ? file : `${copy.to.slice("work/".length)}/${file.slice(copy.from.length + 1)}`;
}

/**
 * This function gives each setup file of a package with tests in the copy that the lane does not load, as
 * `<configuration>: <path in work/>`. The setup files of the tests of a package hold for the lane too.
 */
export function missingSetups(root: string): string[] {
  const out: string[] = [];
  for (const c of COPIES.filter((copy) => copy.tests)) {
    const folder = dirname(c.from);
    const config = `${folder}/${CONFIG_FILE}`;
    if (!existsSync(join(root, config))) continue;
    const list = SETUP_LIST.exec(readFileSync(join(root, config), "utf8"))?.[1] ?? "";
    for (const m of list.matchAll(QUOTED)) {
      const file = pathInLane(relative(root, resolve(root, folder, m[1] ?? "")).replaceAll("\\", "/"));
      if (!SETUP_FILES.includes(file)) out.push(`${config}: ${file}`);
    }
  }
  return out;
}
