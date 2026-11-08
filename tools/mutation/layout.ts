// The layout of the copy of the lane. Stryker reads only the files under its working folder, so prepare.mjs copies
// each folder of COPIES into tools/mutation. A test file whose import does not find a file does not load. Vitest then
// reports no test of the file, and Stryker sees no failed test, so each mutant that the file kills survives. On
// 2026-11-03, three test files of the compiler imported "../../testkit/src/fc-timeout.ts", and the score of module.ts
// fell to 93.34 % (V-072). Thus the function unresolvedImports finds each relative import that the copy breaks.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

/** A comment at the start of a line, and an import or an export of a type. Neither of them loads a file. */
const NOT_LOADED = /^\s*\/\*[\s\S]*?\*\/|^\s*\/\/.*$|^\s*(?:import|export)\s+type\b[^;]*;/gmu;

/** The relative imports of each file that a walk read. A file of a copy does not change in a run of the lane. */
const importsRead = new Map<string, readonly string[]>();

/** This function gives the text of a file without the parts that load no file. */
const loadedText = (file: string): string => readFileSync(file, "utf8").replace(NOT_LOADED, "");

/** This function gives the path of each file that a file imports by a relative path. */
function importsOfFile(file: string): readonly string[] {
  const known = importsRead.get(file);
  if (known !== undefined) return known;
  const found = existsSync(file) ? [...loadedText(file).matchAll(IMPORT)].map((m) => resolve(dirname(file), m[1] ?? "")) : [];
  importsRead.set(file, found);
  return found;
}

/** This function gives each file that the relative imports of a file reach, and the file. */
function reachedFiles(file: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const next = [resolve(file)];
  for (let at = next.pop(); at !== undefined; at = next.pop()) {
    if (seen.has(at)) continue;
    seen.add(at);
    next.push(...importsOfFile(at));
  }
  return seen;
}

/** The file of the printer of the modules, in the folder of the compiler. */
const PRINTER_FILE = "module.ts";

/**
 * This function states if a test file of the compiler prints a module: its imports reach the file of the printer. A module
 * copies the text of each op function, and the counters of Stryker make that text read a name outside itself. So such a test
 * reads the copy of the domains that Stryker does not mutate. A rule on the name of the file missed `module-vec2.test.ts`
 * and 12 other files (2026-11-05). A file that this rule cannot read is a fault of `plainFaults`. This walk follows relative
 * imports only, so an import of a package that reaches the printer stays outside this rule. `plainFaults` refuses an import of
 * the compiler by its package name only outside the folder of the rule. This limit is stated and has no gate.
 */
export function printsModule(file: string): boolean {
  return reachedFiles(file).has(resolve(dirname(file), PRINTER_FILE));
}

/** The test files of the compiler with a computed import, and the file that the import loads. The rule cannot read these imports. */
const COMPUTED_IMPORTS: Readonly<Record<string, string>> = {
  "module.test.ts": "a module that the test prints to a temporary folder",
  "module-run-name.test.ts": "a module that the test prints to a temporary folder",
};

/** A computed import: the argument of `import(` does not start with a quote. */
const COMPUTED_IMPORT = /\bimport\(\s*(?!["'])/u;

/** The name of the printer in the code of a test file. */
const PRINTER_NAME = /\bemitModule\b/u;

/** An import of a value from the domains, or from the compiler by the name of its package. */
const domainsImport = (text: string): boolean => [...text.matchAll(PACKAGE_IMPORT)].some((m) => m[1] === "@mark1russell7/vex-domains");
const compilerImport = (text: string): boolean => [...text.matchAll(PACKAGE_IMPORT)].some((m) => (m[1] ?? "").startsWith("@mark1russell7/vex-compiler"));

/** This function gives each TypeScript file of a folder of the repository, as paths of that folder. */
const filesOf = (root: string, folder: string): string[] =>
  existsSync(join(root, folder))
    ? readdirSync(join(root, folder), { recursive: true, encoding: "utf8" })
        .map((f) => f.replaceAll("\\", "/"))
        .filter((f) => f.endsWith(".ts"))
    : [];

/**
 * This function gives each fault of the rule of the two copies of the domains, as `<file>: <reason>`. `vitest.config.ts` gives
 * the plain copy to a test file of the compiler that prints a module and to the pilots, and the mutated copy to each other
 * file. A fault is a file that this rule cannot classify, or a test that then reads the two copies in one process.
 */
export function plainFaults(root: string): string[] {
  const out: string[] = [];
  const compiler = "packages/compiler/src";
  const pilots = resolve(root, "packages/pilots/src");
  const readsPilots = (file: string): boolean => [...reachedFiles(file)].some((f) => f.startsWith(pilots));
  for (const name of PACKAGES) {
    const folder = `packages/${name}/src`;
    for (const test of filesOf(root, folder).filter(isTest)) {
      const file = join(root, folder, test);
      const text = loadedText(file);
      const place = `${folder}/${test}`;
      const inRule = folder === compiler && !test.includes("/");
      const prints = inRule && printsModule(file);
      if (inRule && COMPUTED_IMPORT.test(text) && COMPUTED_IMPORTS[test] === undefined) out.push(`${place}: a computed import, and the rule cannot read what it loads`);
      if (inRule && !prints && PRINTER_NAME.test(text)) out.push(`${place}: it names the printer, and its imports do not reach the file of the printer`);
      if (!inRule && (reachedFiles(file).has(resolve(root, compiler, PRINTER_FILE)) || compilerImport(text))) out.push(`${place}: it reads the printer, and it is outside the folder that the rule reads`);
      if (!prints && readsPilots(file)) out.push(`${place}: it reads the pilots and does not print a module, so it reads two copies of the domains`);
    }
  }
  for (const test of Object.keys(COMPUTED_IMPORTS)) {
    const file = join(root, compiler, test);
    if (!existsSync(file) || !COMPUTED_IMPORT.test(loadedText(file))) out.push(`${compiler}/${test}: the list of computed imports names it, and it has no computed import`);
  }
  for (const copy of COPIES.filter((c) => c.from !== "packages/domains/src" && c.from !== "packages/pilots/src")) {
    for (const f of filesOf(root, copy.from).filter((path) => !isTest(path))) {
      if (domainsImport(loadedText(join(root, copy.from, f)))) out.push(`${copy.from}/${f}: it imports the domains, so a test that prints a module reads two copies`);
    }
  }
  return [...new Set(out)];
}

/** Each fault that the flip of the rule injects: a file, its text, and the words that the reason must hold. */
const PLAIN_FLIP: readonly { readonly file: string; readonly text: string; readonly words: string }[] = [
  { file: "packages/compiler/src/zz-computed.test.ts", text: "await import(name);\n", words: "a computed import" },
  { file: "packages/compiler/src/zz-name.test.ts", text: 'import { emitModule } from "./other.ts";\n', words: "do not reach the file of the printer" },
  { file: "packages/domains/src/zz-outside.test.ts", text: 'import "../../compiler/src/module.ts";\n', words: "outside the folder" },
  { file: "packages/compiler/src/zz-pilots.test.ts", text: 'import "../../pilots/src/a.ts";\n', words: "two copies of the domains" },
  { file: "packages/testkit/src/zz-helper.ts", text: 'import { Vec2 } from "@mark1russell7/vex-domains";\n', words: "imports the domains" },
];

/**
 * This function shows that `plainFaults` can fail, for its stated reason. A copy with one fault must give that reason only,
 * and a clean copy must give no fault. It gives a line for each row and the count of the rows that did not read so.
 */
export function plainFlip(root: string): { readonly lines: readonly string[]; readonly failed: number } {
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  };
  write("packages/compiler/src/module.ts", "export const printer = 1;\n");
  write("packages/pilots/src/a.ts", "export const a = 1;\n");
  for (const [test, why] of Object.entries(COMPUTED_IMPORTS)) write(`packages/compiler/src/${test}`, `// ${why}\nimport("./module.ts"); await import(url);\n`);
  const lines: string[] = [];
  let failed = 0;
  const row = (name: string, read: boolean, found: readonly string[]): void => {
    if (!read) failed += 1;
    lines.push(`${read ? "ok" : "FAIL"} the rule of the plain domains, ${name}: ${found.length === 0 ? "no fault" : found.join(" | ")}`);
  };
  const clean = plainFaults(root);
  row("clean copy", clean.length === 0, clean);
  for (const fault of PLAIN_FLIP) {
    write(fault.file, fault.text);
    importsRead.clear();
    const found = plainFaults(root);
    row(fault.words, found.length === 1 && (found[0] ?? "").includes(fault.words), found);
    rmSync(join(root, fault.file));
    importsRead.clear();
  }
  return { lines, failed };
}

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
const NOT_MUTATED: ReadonlySet<string> = new Set(["core/test-support.ts", "testkit/fc-setup.ts", "testkit/repo-root.ts", "testkit/arbitraries.ts", "testkit/builder-model-arbitraries.ts", "testkit/sheet-arbitraries.ts"]);

/**
 * The count of the parts of each group of files that one runner does not finish in its time limit of 150 minutes. The count
 * of a group holds a slowest part of 2 times its share under that limit. A dispatch can still name the group as one part.
 */
const PART_COUNTS: Readonly<Record<string, number>> = { "core.base": 4, domains: 3, "compiler.module": 6, "compiler.rest": 4 };

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

/** A segment of a text: a run of lines that ends on a closing line, with the name of its first declaration. */
export interface Segment {
  readonly key: string;
  /** This is the first line of the segment, counted from 1. */
  readonly start: number;
  /** This is the last line of the segment, counted from 1. */
  readonly end: number;
}

/** The first line of a declaration at the top of a file or in a class body, with its name. */
const DECLARATION = /^ {0,2}(?:export +)?(?:(?:async|static|private|protected|public|readonly|get|set|declare|abstract) +)*(?:(?:function\*?|class|const|let|interface|type|enum) +)?([#$A-Za-z_][\w$]*) *[(<=:{]/u;

/** The words that start a statement and not a declaration. */
const STATEMENTS: ReadonlySet<string> = new Set(["if", "for", "while", "switch", "return", "throw", "do", "try", "catch", "else"]);

/**
 * This function cuts a text into segments. Each segment ends on a closing line, and the last segment ends on the last line.
 * The key of a segment is the name of its first declaration, with `#2` for the second segment of that name. A key thus
 * stays the same when a change moves the lines, so a cost map of the segments outlives a change of other segments.
 */
export function segmentsOf(text: string): Segment[] {
  const lines = text.split(/\r?\n/u);
  const segments: Segment[] = [];
  const seen = new Map<string, number>();
  let start = 1;
  let name: string | undefined;
  const close = (end: number): void => {
    const base = name ?? `@${segments.length + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    segments.push({ key: n === 1 ? base : `${base}#${n}`, start, end });
    start = end + 1;
    name = undefined;
  };
  lines.forEach((line, index) => {
    const declared = DECLARATION.exec(line)?.[1];
    if (name === undefined && declared !== undefined && !STATEMENTS.has(declared)) name = declared;
    if (CLOSING_LINE.test(line)) close(index + 1);
  });
  if (start <= lines.length) close(lines.length);
  return segments;
}

/** The cost map of a file: the planned net time of each segment, in milliseconds, from the plan of a dry run (LANE.COST). */
export interface CostMap {
  /** This is the run of the dry run that gave the plan. */
  readonly run: string;
  readonly segments: Readonly<Record<string, number>>;
}

/**
 * This function gives the cost map of a text from the plan of its lines: the planned net time of each segment. The plan of
 * a line is `[line, runs, static runs, net ms]`, with lines counted from 1.
 */
export function costMapOf(text: string, run: string, lines: readonly (readonly [number, number, number, number])[]): CostMap {
  const segments = segmentsOf(text);
  const cost: Record<string, number> = Object.fromEntries(segments.map((segment) => [segment.key, 0]));
  for (const [line, , , netMs] of lines) {
    const segment = segments.find((s) => s.start <= line && line <= s.end);
    if (segment !== undefined) cost[segment.key] = (cost[segment.key] ?? 0) + netMs;
  }
  return { run, segments: cost };
}

/**
 * This function gives the weight of each line of a text from a cost map. A segment spreads its cost over its lines. A
 * segment that the map does not name has the mean cost of a line of the named segments, so a new function has a cost too.
 */
export function lineWeights(text: string, map: CostMap): number[] {
  const segments = segmentsOf(text);
  const named = segments.filter((s) => map.segments[s.key] !== undefined);
  const namedLines = named.reduce((sum, s) => sum + s.end - s.start + 1, 0);
  const namedCost = named.reduce((sum, s) => sum + (map.segments[s.key] ?? 0), 0);
  const mean = namedLines === 0 ? 1 : namedCost / namedLines;
  const weights: number[] = [];
  for (const s of segments) {
    const size = s.end - s.start + 1;
    const cost = map.segments[s.key];
    for (let line = 0; line < size; line += 1) weights.push(cost === undefined ? mean : cost / size);
  }
  return weights;
}

/**
 * This function gives the last line of each part of a text but the last, and the count of its lines. The end of a part is
 * the closing line of a method near its share of the lines, or of the weights when the call gives a weight for each line.
 * A mutant of the body of a method thus stays in one part.
 */
export function partEnds(text: string, count: number, weights?: readonly number[]): { readonly ends: number[]; readonly lines: number } {
  const lines = text.split(/\r?\n/u);
  const ends: number[] = [];
  const total = weights?.reduce((sum, w) => sum + w, 0) ?? 0;
  let line = 0;
  let sum = 0;
  for (let part = 1; part < count; part += 1) {
    let target = Math.round((part * lines.length) / count);
    if (weights !== undefined && total > 0) {
      while (line < lines.length && sum + (weights[line] ?? 0) < (part * total) / count) sum += weights[line++] ?? 0;
      target = line;
    }
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

/** The file of the cost maps of the lane, in tools/mutation: a map for each file that the lane cuts by lines. */
export const COSTS_FILE = "costs.json";

/** This function gives the cost maps of the lane, by the path of the lane of each file, or none with no file. */
export function costMaps(root: string): Readonly<Record<string, CostMap>> {
  const path = join(root, "tools", "mutation", COSTS_FILE);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, CostMap>) : {};
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
      const text = readFileSync(sourcePath(root, file), "utf8");
      const map = costMaps(root)[file];
      const { ends, lines } = partEnds(text, count, map === undefined ? undefined : lineWeights(text, map));
      return [`${file}:${(ends[index - 1] ?? 0) + 1}-${ends[index] ?? lines}`];
    }
    const sized = groupFiles(root, group).map((path) => ({ path, size: statSync(sourcePath(root, path)).size }));
    return splitBySize(sized, count)[index] ?? [];
  }
  const domainFile = DOMAIN_FILE.exec(part)?.[1];
  if (domainFile !== undefined) return [`work/domains/${domainFile}.ts`];
  return groupFiles(root, part);
}

/**
 * The test files of the four packages that no part of the lane reads, as paths of the repository, each with its reason. The
 * load check and the gate fail on a test file that no part reads and that this list does not name (LANE.FILES).
 */
export const NOT_READ: Readonly<Record<string, string>> = {
  "packages/core/src/spec-coverage.test.ts": "This test reads the spec by a path from packages/core, so it does not start in the copy.",
  "packages/compiler/src/names-gate.test.ts": "This test reads work/test, and Stryker does not mutate that folder. So this test stops no mutant.",
  "packages/testkit/src/mutation-lane.test.ts": "This test reads the files of the lane in tools/mutation, and Stryker does not mutate them. So this test stops no mutant.",
  "packages/testkit/src/fc-setup.test.ts": "This test reads the setup fc-setup.ts, and the lane does not mutate it (NOT_MUTATED). So this test stops no mutant.",
  "packages/core/bench/measure.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
  "packages/core/bench/processes.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
  "packages/compiler/bench/ablation.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
  "packages/compiler/bench/alloc.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
  "packages/compiler/bench/alloc-limit.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
  "packages/compiler/bench/limit-walk.test.ts": "This test reads the code of a bench. The lane copies src only, and it does not mutate a bench.",
};

/** The folders of a package that hold no test file of the package. */
const NOT_SOURCE: ReadonlySet<string> = new Set(["node_modules", "dist", "coverage"]);

/** This function gives each test file in a folder, as paths of that folder. */
function testsIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return NOT_SOURCE.has(entry.name) ? [] : testsIn(join(folder, entry.name)).map((file) => `${entry.name}/${file}`);
    return isTest(entry.name) ? [entry.name] : [];
  });
}

/** This function gives each test file of the four packages on the disk, as paths of the repository. */
export function testFilesOnDisk(root: string): string[] {
  return PACKAGES.flatMap((name) => testsIn(join(root, "packages", name)).map((file) => `packages/${name}/${file}`)).toSorted();
}

/** This function gives the package of a path of the repository: `packages/core/src/a.ts` is `core`. */
export function packageOfPath(path: string): string {
  return path.split("/")[1] ?? path;
}

/**
 * This function gives each test file on the disk that no part reads and that `NOT_READ` does not name, as paths of the
 * repository. The set holds the test files that the parts read, as paths of the lane.
 */
export function unreadTests(root: string, read: ReadonlySet<string>): string[] {
  return testFilesOnDisk(root).filter((file) => !read.has(`work/${pathInLane(file)}`) && NOT_READ[file] === undefined);
}

/** This function gives each entry of `NOT_READ` that is not true: its file is not on the disk, or a part reads its file. */
export function staleEntries(root: string, read: ReadonlySet<string>): string[] {
  const onDisk = new Set(testFilesOnDisk(root));
  return Object.keys(NOT_READ).filter((file) => !onDisk.has(file) || read.has(`work/${pathInLane(file)}`));
}

/** The file in which the load check saves its selection, as a path in this folder. Each job of the lane copies it beside its report. */
export const SELECTION_FILE = "work/lane-selection.json";

/** The load check writes the version of its runner and the folder that gives it to this file, for the record of the run. */
export const RUNNER_FILE = "work/lane-runner.json";

/**
 * The load check gives this option to `collect` of the runner. Under Vitest 5 the default form parses a file and does not
 * start it, so it does not see a missing package. The script `load-run-flip.ts` reads this option on that version.
 */
export const COLLECT_OPTIONS: { readonly staticParse: false } = { staticParse: false };

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
