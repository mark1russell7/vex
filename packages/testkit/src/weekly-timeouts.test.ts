import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROPERTY_BUDGET_MS, propertyTimeout, SETUP_MARGIN_MS } from "./fc-timeout.ts";

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

/** The start of a block of Vitest: `describe`, `it` or `test`, with a modifier such as `.each(...)` or `.skip`. */
const START = /(?<![.\w])(?:describe|it|test)(?:\.\w+(?:\([^)]*\))?)*\(/gu;
const CLOSE: Readonly<Record<string, string>> = { ")": "(", "]": "[", "}": "{" };

/** This function gives the arguments of the call whose `(` is at `open`, as texts. A call that does not close ends at the end of the text. */
function argsOf(text: string, open: number): readonly string[] {
  const args: string[] = [];
  const stack: string[] = [];
  let start = open + 1;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i] ?? "";
    // A comment can hold a quote or a bracket, so the scan skips it.
    if (c === "/" && text[i + 1] === "/") i = text.includes("\n", i) ? text.indexOf("\n", i) : text.length;
    else if (c === "/" && text[i + 1] === "*") i = text.includes("*/", i) ? text.indexOf("*/", i) + 1 : text.length;
    else if (c === '"' || c === "'" || c === "`") {
      // A string ends at the next quote of its kind that has no backslash before it.
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(" || c === "[" || c === "{") stack.push(c);
    else if (c in CLOSE) {
      if (stack.length === 0) return [...args, text.slice(start, i).trim()];
      stack.pop();
    } else if (c === "," && stack.length === 0) {
      args.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  return [...args, text.slice(start).trim()];
}

/** This function tells if the text of an argument is a function: the body of a block, not its time-out. */
function isFunction(x: string): boolean {
  return x.includes("=>") || x.startsWith("function") || x.startsWith("async");
}

/**
 * This function gives each block of a property (a title with `P<n>`) whose time-out does not come from
 * `propertyTimeout`. The time-out is a `timeout` option of the second argument, or a third argument that is not the
 * function of the block, as in `it(name, fn, 60_000)`.
 */
function fixedTimeouts(text: string): readonly string[] {
  const out: string[] = [];
  for (const m of text.matchAll(START)) {
    const args = argsOf(text, m.index + m[0].length - 1);
    const [title = "", second = "", third] = args;
    if (!/^["'`].*\bP\d+\b/su.test(title)) continue;
    const option = second.startsWith("{") && /\btimeout\b/u.test(second) && !/\btimeout:\s*propertyTimeout\(/u.test(second);
    const last = third !== undefined && !isFunction(third) && !third.startsWith("propertyTimeout(");
    if (option || last) out.push(`${m[0]}${title}, ${option ? second : `…, ${third ?? ""}`})`);
  }
  return out;
}

/** This file. Its cases of the guard are text in strings, not blocks, so the scan of the test files leaves it out. */
const SELF = join("packages", "testkit", "src", "weekly-timeouts.test.ts");

/** This function gives each test file of the packages but this one, as a path from the root of the repository. */
function testFiles(): readonly string[] {
  return readdirSync(join(root, "packages"), { recursive: true, encoding: "utf8" })
    .filter((p) => /[\\/]src[\\/].*\.test\.ts$/u.test(p) && !p.includes("node_modules"))
    .map((p) => join("packages", p))
    .filter((p) => p !== SELF);
}

describe("the time-out of a test with properties", () => {
  it("is the normal time-out without FC_NUM_RUNS", () => {
    expect(propertyTimeout(60_000, {})).toBe(60_000);
    expect(propertyTimeout(60_000, { FC_TIME_LIMIT_MS: "5" })).toBe(60_000);
  });

  it("is the budget plus the setup margin with FC_NUM_RUNS", () => {
    expect(propertyTimeout(60_000, { FC_NUM_RUNS: "1000000", FC_TIME_LIMIT_MS: "600000" })).toBe(900_000);
    expect(propertyTimeout(60_000, { FC_NUM_RUNS: "1000000", FC_TIME_LIMIT_MS: "1200000" })).toBe(1_500_000);
    expect(propertyTimeout(60_000, { FC_NUM_RUNS: "10000" })).toBe(PROPERTY_BUDGET_MS + SETUP_MARGIN_MS);
  });

  it("throws for a budget that is not a positive number of ms", () => {
    for (const bad of ["ten minutes", "", "0", "-5", "Infinity"]) expect(() => propertyTimeout(60_000, { FC_NUM_RUNS: "10000", FC_TIME_LIMIT_MS: bad })).toThrow(RangeError);
    expect(propertyTimeout(60_000, { FC_NUM_RUNS: "10000", FC_TIME_LIMIT_MS: "1" })).toBe(SETUP_MARGIN_MS + 1);
  });

  it("is never shorter than the normal time-out", () => {
    expect(propertyTimeout(2_000_000, { FC_NUM_RUNS: "10000", FC_TIME_LIMIT_MS: "600000" })).toBe(2_000_000);
  });

  it("reads process.env by default", () => {
    expect(propertyTimeout(1234)).toBe(process.env["FC_NUM_RUNS"] === undefined ? 1234 : propertyTimeout(1234, process.env));
  });
});

describe("the time-outs of the weekly long run", () => {
  it("finds the test files, and leaves out only this file", () => {
    const files = testFiles();
    expect(files.length).toBeGreaterThan(50);
    expect(files).not.toContain(SELF);
    expect(files).toContain(join("packages", "compiler", "src", "module-sheet.test.ts"));
  });

  // A real file of properties with a fixed time-out fails: the scan sees the blocks of a whole test file.
  it("finds a fixed time-out in a real file of properties", () => {
    const real = readFileSync(join(root, "packages", "compiler", "src", "module-sheet.test.ts"), "utf8");
    expect(fixedTimeouts(real)).toEqual([]);
    const broken = real.replace("{ timeout: propertyTimeout(60_000) }", "{ timeout: 60_000 }");
    expect(broken).not.toBe(real);
    expect(fixedTimeouts(broken)).toHaveLength(1);
  });

  // The weekly run gives each property 10 minutes (FC_TIME_LIMIT_MS). A fixed time-out of 60 s in the options of a
  // property ends the test first. On 2026-11-02, two P17 properties of the compiler failed so in all 5 jobs.
  it("gives each property block with a time-out the time-out of propertyTimeout", () => {
    const found = testFiles().flatMap((p) => fixedTimeouts(readFileSync(join(root, p), "utf8")).map((m) => `${p}: ${m}`));
    expect(found).toEqual([]);
  });

  it("finds each shape of a fixed time-out of a property", () => {
    const shapes = [
      'describe("X P17: random sheets", { timeout: 60_000 }, () => {',
      'describe("X P17: random sheets", { timeout: 60_000, retry: 0 }, () => {',
      'describe("X P17: random sheets", { retry: 0, timeout: 60_000 }, () => {',
      "describe('X P17: random sheets', { timeout: 60_000 }, () => {",
      "it(`X P17: random sheets`, { timeout: 60_000 }, () => {",
      'test("X P17: random sheets", { timeout: 60_000 }, () => {',
      'it.each([1, 2])("X P17: case %d", { timeout: 60_000 }, (n) => {',
      'describe.skip("X P17: random sheets", { timeout: 60_000 }, () => {',
      'it.concurrent("X P17: random sheets", { timeout: LONG }, () => {',
      'it("X P17: random sheets", { timeout }, () => {',
      'it("X P17: random sheets", () => {\n  fc.assert(fc.property(fc.nat(), (n) => n >= 0));\n}, 60_000);',
      'it("X P17: random sheets", () => {}, LONG);',
    ];
    expect(shapes.map((s) => fixedTimeouts(s).length)).toEqual(shapes.map(() => 1));
  });

  it("passes a time-out from propertyTimeout and a block that is not a property", () => {
    const shapes = [
      'describe("X P17: random sheets", { timeout: propertyTimeout(60_000) }, () => {',
      'it.each([1])("X P17: case %d", { retry: 0, timeout: propertyTimeout(60_000) }, (n) => {',
      'describe("SHEET.DEEP: deep sheets", { timeout: 30_000 }, () => {',
      'describe("X P17: random sheets", { retry: 2 }, () => {',
      'it("X P17: random sheets", () => {\n  f(a, b);\n}, propertyTimeout(60_000));',
      'it("X P17: random sheets", { retry: 0 }, () => {\n  f(a, "),", b);\n});',
      'expect(/P17/u.test("P17: x"), 60_000);',
      'it("X P17: random sheets", () => {\n  // the module\'s check, (a "quote"\n  /* a ) and a , */\n  f(a);\n});',
      'it("SHEET.DEEP: deep", () => {}, 30_000);',
    ];
    expect(shapes.flatMap(fixedTimeouts)).toEqual([]);
  });
});
