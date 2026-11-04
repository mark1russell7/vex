import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GATE_NPM_PACKAGES, lockInputs, sameInputs } from "./gate-inputs.ts";

/**
 * This function gives the root of the repository: the first folder above this file that holds `pnpm-workspace.yaml`.
 * The mutation lane runs a copy of this file in `tools/mutation/.stryker-tmp`. A fixed number of steps up does not find
 * the root from that copy.
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

const root = repoRoot();

/** The entries of the two speed gates: the files that `bench:gate` starts. */
const ENTRIES = ["packages/core/bench/gate.ts", "packages/compiler/bench/gate.ts", "packages/compiler/bench/gate-processes.ts"];

/** This function gives the indent of a line of YAML, as a number of spaces. */
function indent(line: string): number {
  return line.length - line.trimStart().length;
}

/** This function gives the patterns of `paths` of the `changes` step of `speed-gate.yml`, in their order. */
function gatePaths(): readonly string[] {
  const lines = readFileSync(join(root, ".github/workflows/speed-gate.yml"), "utf8").split("\n");
  const start = lines.findIndex((l) => /^\s+paths: \|\s*$/u.test(l));
  const own = indent(lines[start] ?? "");
  const out: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.trim() === "" || indent(l) <= own) break;
    out.push(l.trim());
  }
  return out;
}

/** This function gives a regular expression for a pattern of `on.pull_request.paths`. */
function globOf(pattern: string): RegExp {
  const body = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*\*\/|\*\*|\*/gu, (m) => (m === "**/" ? "(?:.*/)?" : m === "**" ? ".*" : "[^/]*"));
  return new RegExp(`^${body}$`, "u");
}

/** This function tells if a change of the file starts the gates. The last pattern that matches the file decides. */
function inGate(patterns: readonly string[], file: string): boolean {
  let match = false;
  for (const p of patterns) {
    const negated = p.startsWith("!");
    if (globOf(negated ? p.slice(1) : p).test(file)) match = !negated;
  }
  return match;
}

/** The file of each workspace package and each of its exports, by the name of the import. */
function workspaceImports(): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const dir of readdirSync(join(root, "packages"))) {
    const file = join(root, "packages", dir, "package.json");
    if (!existsSync(file)) continue;
    const pkg: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (typeof pkg !== "object" || pkg === null || !("name" in pkg) || typeof pkg.name !== "string") continue;
    const name = pkg.name;
    if ("main" in pkg && typeof pkg.main === "string") out.set(name, join(root, "packages", dir, pkg.main));
    const exports = "exports" in pkg && typeof pkg.exports === "object" && pkg.exports !== null ? Object.entries(pkg.exports) : [];
    for (const [sub, target] of exports) if (typeof target === "string") out.set(sub === "." ? name : `${name}${sub.slice(1)}`, join(root, "packages", dir, target));
  }
  return out;
}

/**
 * A static import, a re-export or a dynamic import of a string. A statement starts its line, so the text of a message
 * (`the edge from "a"`) and a call such as `from("position")` are not one.
 */
const IMPORT = /^\s*(?:import|export)\s[^;]*?\bfrom\s+"([^"]+)"|^\s*import\s+"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/gmu;

/** This function gives each file of the repository that the entries reach by their imports, and each package outside it. */
function reached(entries: readonly string[]): { readonly files: readonly string[]; readonly external: readonly string[] } {
  const names = workspaceImports();
  const seen = new Set<string>();
  const external = new Set<string>();
  const todo = entries.map((e) => join(root, e));
  for (let file = todo.pop(); file !== undefined; file = todo.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, a, b, c] of readFileSync(file, "utf8").matchAll(IMPORT)) {
      const spec = a ?? b ?? c ?? "";
      const next = spec.startsWith(".") ? resolve(dirname(file), spec) : names.get(spec);
      if (next !== undefined) todo.push(next);
      else if (!spec.startsWith("node:")) external.add(spec);
    }
  }
  return { files: [...seen].map((f) => relative(root, f).replaceAll("\\", "/")).toSorted((x, y) => x.localeCompare(y)), external: [...external].toSorted((x, y) => x.localeCompare(y)) };
}

describe("the paths of the speed gates", () => {
  it("match like on.pull_request.paths: the last pattern that matches decides", () => {
    const patterns = ["packages/*/src/**", "!packages/*/src/**/*.test.ts", "packages/core/src/keep.test.ts"];
    expect(inGate(patterns, "packages/core/src/evaluate.ts")).toBe(true);
    expect(inGate(patterns, "packages/core/src/deep/a.test.ts")).toBe(false);
    expect(inGate(patterns, "packages/core/src/keep.test.ts")).toBe(true);
    expect(inGate(patterns, "packages/core/bench/gate.ts")).toBe(false);
  });

  // The gates skip a pull request that changes only tests. That is safe only while each file that the gates run is
  // in the paths, so a new import of the bench that is outside them fails here.
  it("contain each file of the repository that the gates run", () => {
    const patterns = gatePaths();
    const { files } = reached(ENTRIES);
    expect(files).toEqual(expect.arrayContaining([...ENTRIES, "packages/core/src/evaluate.ts", "packages/core/src/test-support.ts"]));
    expect(files.filter((f) => !inGate(patterns, f))).toEqual([]);
  });

  // A package from npm changes only with `pnpm-lock.yaml`. The gates start for a change of the lock file only when
  // it changes a package of GATE_NPM_PACKAGES, so the list must hold each package that the gates import.
  it("reach only the packages from npm of GATE_NPM_PACKAGES", () => {
    expect(reached(ENTRIES).external).toEqual(GATE_NPM_PACKAGES);
  });
});

/** This function gives a small lock file: one entry of coeval, one of another package, and the snapshots. */
function lock(coeval: string, integrity: string, other: string): string {
  return [
    "packages:",
    "",
    `  '@mark1russell7/coeval@${coeval}':`,
    `    resolution: {integrity: ${integrity}}`,
    "",
    `  left-pad@${other}:`,
    "    resolution: {integrity: sha512-x}",
    "",
    "snapshots:",
    "",
    `  '@mark1russell7/coeval@${coeval}': {}`,
    "",
  ].join("\n");
}

describe("the packages from npm of the speed gates in the lock file", () => {
  it("gives the key and the resolution of each entry of the list, and skips the snapshots", () => {
    expect(lockInputs(lock("0.17.0", "sha512-a", "1.0.0"), GATE_NPM_PACKAGES)).toEqual(["@mark1russell7/coeval@0.17.0 resolution: {integrity: sha512-a}"]);
    expect(lockInputs("  unscoped:\n    resolution: {integrity: sha512-u}\n", ["unscoped"])).toEqual(["unscoped resolution: {integrity: sha512-u}"]);
  });

  it("finds each package of the list in the lock file of the repository", () => {
    const real = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");
    for (const name of GATE_NPM_PACKAGES) expect(lockInputs(real, [name]).length).toBeGreaterThan(0);
  });

  it("is the same when only another package changes", () => {
    expect(sameInputs(lock("0.17.0", "sha512-a", "1.0.0"), lock("0.17.0", "sha512-a", "2.0.0"))).toBe(true);
  });

  it("is not the same when a version, an integrity or the number of entries of the list changes", () => {
    const base = lock("0.17.0", "sha512-a", "1.0.0");
    expect(sameInputs(base, lock("0.17.1", "sha512-a", "1.0.0"))).toBe(false);
    expect(sameInputs(base, lock("0.17.0", "sha512-b", "1.0.0"))).toBe(false);
    expect(sameInputs(base, `${base}\n  '@mark1russell7/optional@1.0.0':\n    resolution: {integrity: sha512-o}\n`)).toBe(false);
  });

  it("leave out the tests", () => {
    expect(inGate(gatePaths(), "packages/compiler/src/module-sheet.test.ts")).toBe(false);
    expect(inGate(gatePaths(), "packages/core/src/__golden__/life.json")).toBe(false);
  });
});
