// The layout of the copy of the lane. Stryker reads only the files under its working folder, so prepare.mjs copies
// each folder of COPIES into tools/mutation. A test file whose import does not find a file does not load. Vitest then
// reports no test of the file, and Stryker sees no failed test, so each mutant that the file kills survives. On
// 2026-11-03, three test files of the compiler imported "../../testkit/src/fc-timeout.ts", and the score of module.ts
// fell to 93.34 % (V-072). Thus the function unresolvedImports finds each relative import that the copy breaks.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

/** The four published packages of the lane. */
export const PACKAGES: readonly string[] = ["core", "domains", "testkit", "compiler"];

/** The modules of the kernel of coeval in the core (docs/REVIEW.md, decision D13). */
const KERNEL: ReadonlySet<string> = new Set(["kernel.ts", "plan.ts", "same.ts", "document.ts", "deps.ts", "write.ts"]);

/** The file that has its own parts, by lines: the printer of the standalone modules. */
const MODULE_FILE = "module.ts";

/** The files of the packages that hold no code of a package, as paths of a package folder. */
const NOT_MUTATED: ReadonlySet<string> = new Set(["core/test-support.ts", "testkit/fc-setup.ts", "testkit/arbitraries.ts", "testkit/builder-model-arbitraries.ts", "testkit/sheet-arbitraries.ts"]);

/**
 * The count of the parts of each group of files that one runner does not finish in its time limit of 150 minutes. The count
 * of a group holds a slowest part of 2 times its share under that limit. A dispatch can still name the group as one part.
 */
const PART_COUNTS: Readonly<Record<string, number>> = { "core.base": 4, domains: 3, "compiler.module": 2, "compiler.rest": 4 };

/** A part with a number: `core.base.2`. */
const NUMBERED = /^(.+)\.(\d+)$/u;

/** A part that names one module of the domains, so that a dispatch can read that module alone. */
const DOMAIN_FILE = /^domains\.([a-z][\w-]*)$/u;

/** The closing line of a method of a class, or of a function at the top of a file. */
const CLOSING_LINE = /^ {0,2}\}$/u;

/** This function gives the numbered parts of a group. */
function numbered(group: string): string[] {
  return Array.from({ length: PART_COUNTS[group] ?? 0 }, (_unused, index) => `${group}.${index + 1}`);
}

/** This function gives each part of a full run of the lane, in the order of the jobs. */
export function laneParts(): string[] {
  return ["core.kernel", ...numbered("core.base"), ...numbered("domains"), "testkit", ...numbered("compiler.module"), ...numbered("compiler.rest")];
}

/** This function gives the package of a part: `core.base.2` is `core`. */
export function packageOfPart(part: string): string {
  return part.split(".")[0] ?? part;
}

/** This function gives the source files of a package that the lane mutates, as paths of its package folder. */
function sourceFiles(root: string, name: string): string[] {
  return readdirSync(join(root, "packages", name, "src"), { recursive: true, encoding: "utf8" })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file.endsWith(".ts") && !isTest(file) && file !== "index.ts" && !NOT_MUTATED.has(`${name}/${file}`))
    .toSorted();
}

/**
 * This function puts files into `count` parts of near the same size. It takes the largest file first and gives each file
 * to the smallest part. Each input gives one result, so the plan and each job of a run read the same parts.
 */
export function splitBySize(files: readonly { readonly path: string; readonly size: number }[], count: number): string[][] {
  const parts = Array.from({ length: count }, () => ({ size: 0, files: [] as string[] }));
  const largestFirst = files.toSorted((a, b) => b.size - a.size || a.path.localeCompare(b.path));
  for (const file of largestFirst) {
    const smallest = parts.reduce((best, part) => (part.size < best.size ? part : best));
    smallest.size += file.size;
    smallest.files.push(file.path);
  }
  return parts.map((part) => part.files.toSorted());
}

/**
 * This function gives the last line of each part of a text but the last, and the count of its lines. The end of a part is
 * the closing line of a method near its share of the lines. A mutant of the body of a method thus stays in one part.
 */
export function partEnds(text: string, count: number): { readonly ends: number[]; readonly lines: number } {
  const lines = text.split(/\r?\n/u);
  const ends: number[] = [];
  for (let part = 1; part < count; part += 1) {
    const target = Math.round((part * lines.length) / count);
    let found: number | undefined;
    for (let away = 0; away < lines.length && found === undefined; away += 1) {
      if (CLOSING_LINE.test(lines[target + away] ?? "")) found = target + away;
      else if (CLOSING_LINE.test(lines[target - away] ?? "")) found = target - away;
    }
    if (found === undefined) throw new Error("The text has no closing line for the end of a part.");
    ends.push(found + 1);
  }
  return { ends, lines: lines.length };
}

/** This function gives the paths of the lane of files of a package. */
function inWork(name: string, files: readonly string[]): string[] {
  return files.map((file) => `work/${name}/${file}`);
}

/** This function gives the files of a group of files, as paths of the lane. */
function groupFiles(root: string, group: string): string[] {
  if (PACKAGES.includes(group)) return inWork(group, sourceFiles(root, group));
  if (group === "core.kernel") return inWork("core", sourceFiles(root, "core").filter((file) => KERNEL.has(file)));
  if (group === "core.base") return inWork("core", sourceFiles(root, "core").filter((file) => !KERNEL.has(file)));
  if (group === "compiler.module") return inWork("compiler", [MODULE_FILE]);
  if (group === "compiler.rest") return inWork("compiler", sourceFiles(root, "compiler").filter((file) => file !== MODULE_FILE));
  throw new Error(`The lane does not have the part ${group}.`);
}

/** This function gives the path in the repository of a path of the lane. */
function sourcePath(root: string, path: string): string {
  const [, name, file] = /^work\/([^/]+)\/(.+)$/u.exec(path) ?? [];
  return join(root, "packages", name ?? "", "src", file ?? "");
}

/**
 * This function gives the entries of the option `mutate` of Stryker for a part. A part is a package, a group, a numbered
 * part of a group, or one module of the domains. An entry is a path of the lane. A part of `module.ts` adds a range of lines.
 */
export function mutateOf(root: string, part: string): string[] {
  const [, group, number] = NUMBERED.exec(part) ?? [];
  if (group !== undefined && number !== undefined) {
    const count = PART_COUNTS[group];
    const index = Number(number) - 1;
    if (count === undefined || index < 0 || index >= count) throw new Error(`The lane does not have the part ${part}.`);
    if (group === "compiler.module") {
      const file = `work/compiler/${MODULE_FILE}`;
      const { ends, lines } = partEnds(readFileSync(sourcePath(root, file), "utf8"), count);
      return [`${file}:${(ends[index - 1] ?? 0) + 1}-${ends[index] ?? lines}`];
    }
    const sized = groupFiles(root, group).map((path) => ({ path, size: statSync(sourcePath(root, path)).size }));
    return splitBySize(sized, count)[index] ?? [];
  }
  const domainFile = DOMAIN_FILE.exec(part)?.[1];
  if (domainFile !== undefined) return [`work/domains/${domainFile}.ts`];
  return groupFiles(root, part);
}

/** This function gives the path of the lane that a changed file of the repository selects, if it selects one. */
function selectedBy(path: string): string | undefined {
  const copy = COPIES.find((c) => c.tests && path.startsWith(`${c.from}/`));
  if (copy === undefined) return undefined;
  return `${copy.to}/${path.slice(copy.from.length + 1).replace(/\.test\.ts$/u, ".ts")}`;
}

/** This function keeps the entries of `mutate` whose file is in `files`. An entry can have a range of lines. */
export function entriesIn(entries: readonly string[], files: readonly string[]): string[] {
  return entries.filter((entry) => files.includes(entry.split(":")[0] ?? entry));
}

/**
 * This function gives the parts and the files of a run over the changed files of the repository. A changed test file also
 * selects the source file of the same name. A file with no such link waits for the next full run.
 */
export function changedParts(root: string, changed: readonly string[]): { readonly parts: string[]; readonly files: string[] } {
  const selected = [...new Set(changed.map(selectedBy))].filter((file) => file !== undefined);
  const parts = laneParts().filter((part) => entriesIn(mutateOf(root, part), selected).length > 0);
  const known = new Set(parts.flatMap((part) => entriesIn(mutateOf(root, part), selected)).map((entry) => entry.split(":")[0] ?? entry));
  return { parts, files: selected.filter((file) => known.has(file)).toSorted() };
}
