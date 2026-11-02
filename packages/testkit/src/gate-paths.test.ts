import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/** The entries of the two speed gates: the files that `bench:gate` starts. */
const ENTRIES = ["packages/core/bench/gate.ts", "packages/compiler/bench/gate.ts"];

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

  // A package from npm changes only with `pnpm-lock.yaml`, and that file does not start the gates. This list makes a
  // new package of the gates a decision.
  it("reach only the packages from npm of this list", () => {
    expect(reached(ENTRIES).external).toEqual(["@mark1russell7/coeval", "@mark1russell7/optional"]);
  });

  it("leave out the tests", () => {
    expect(inGate(gatePaths(), "packages/compiler/src/module-sheet.test.ts")).toBe(false);
    expect(inGate(gatePaths(), "packages/core/src/__golden__/life.json")).toBe(false);
  });
});
