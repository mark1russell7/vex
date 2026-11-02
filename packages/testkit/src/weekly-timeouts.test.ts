import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROPERTY_BUDGET_MS, propertyTimeout, SETUP_MARGIN_MS } from "./fc-timeout.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));

/**
 * A block of Vitest (`describe`, `it` or `test`, with a modifier such as `.each(...)` or `.skip`) with a title and an
 * options object. The groups are the title and the text of the options.
 */
const BLOCK = /\b(?:describe|it|test)(?:\.\w+(?:\([^)]*\))?)*\(\s*(["'`])((?:(?!\1).)*)\1\s*,\s*\{([^{}]*)\}/gu;

/** This function gives each block of a property (a title with `P<n>`) whose time-out does not come from `propertyTimeout`. */
function fixedTimeouts(text: string): readonly string[] {
  return [...text.matchAll(BLOCK)].filter(([, , title = "", options = ""]) => /\bP\d+\b/u.test(title) && /\btimeout\b/u.test(options) && !/\btimeout:\s*propertyTimeout\(/u.test(options)).map((m) => m[0]);
}

/** This function gives each test file of the packages, as a path from the root of the repository. */
function testFiles(): readonly string[] {
  return readdirSync(join(root, "packages"), { recursive: true, encoding: "utf8" })
    .filter((p) => /[\\/]src[\\/].*\.test\.ts$/u.test(p) && !p.includes("node_modules"))
    .map((p) => join("packages", p));
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

  it("is never shorter than the normal time-out", () => {
    expect(propertyTimeout(2_000_000, { FC_NUM_RUNS: "10000", FC_TIME_LIMIT_MS: "600000" })).toBe(2_000_000);
  });

  it("reads process.env by default", () => {
    expect(propertyTimeout(1234)).toBe(process.env["FC_NUM_RUNS"] === undefined ? 1234 : propertyTimeout(1234, process.env));
  });
});

describe("the time-outs of the weekly long run", () => {
  it("finds the test files", () => {
    expect(testFiles().length).toBeGreaterThan(50);
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
    ];
    expect(shapes.map((s) => fixedTimeouts(s).length)).toEqual(shapes.map(() => 1));
  });

  it("passes a time-out from propertyTimeout and a block that is not a property", () => {
    const shapes = [
      'describe("X P17: random sheets", { timeout: propertyTimeout(60_000) }, () => {',
      'it.each([1])("X P17: case %d", { retry: 0, timeout: propertyTimeout(60_000) }, (n) => {',
      'describe("SHEET.DEEP: deep sheets", { timeout: 30_000 }, () => {',
      'describe("X P17: random sheets", { retry: 2 }, () => {',
    ];
    expect(shapes.flatMap(fixedTimeouts)).toEqual([]);
  });
});
