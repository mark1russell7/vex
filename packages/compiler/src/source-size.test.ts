/**
 * The size of the source of tier 2 (COMPILE.SOURCE.SIZE). A line of the source has no indent on the production path, so
 * the source stays linear in the block nesting. A let with no function keeps the map of functions, so the walk of the
 * lowering stays linear in a chain of those lets. The depth of the blocks stays the same as a shape grows, so the time
 * of the parse of the source grows with its lines only (V-089).
 */
import type * as Vex from "@mark1russell7/vex";
import { app, axes, each, fold, let_, lit, ref, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GROWTH_SHAPES } from "../test/growth.ts";
import { factsOf } from "./facts.ts";
import { printJs } from "./js.ts";
import { generate } from "./tiers.ts";

const walk = vi.hoisted(() => ({ count: 0 }));

vi.mock("@mark1russell7/vex", async (original) => {
  const actual = await original<typeof Vex>();
  const counted: typeof actual.children = (e) => {
    walk.count++;
    return actual.children(e);
  };
  return { ...actual, children: counted };
});

const OPTIONS = { domains: [NumDomain, BoolDomain, TextDomain], schema: { fields: { n: "number" } } } as const;
const n = ref("n");

/** The generated programs: each form of a block of the source. */
const blocks = fc.letrec<{ num: Expr }>((tie) => ({
  num: fc.oneof(
    { maxDepth: 4, depthSize: "small" },
    fc.integer({ min: -3, max: 3 }).map((x) => lit(x)),
    fc.constant(n),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => app("add", a, b)),
    fc.tuple(tie("num"), tie("num"), tie("num")).map(([c, a, b]) => app("if", app("gt", c, lit(0)), a, b)),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => app("ifError", a, b)),
    tie("num").map((body) => app("sum", each(axes.all, body))),
    fc.tuple(tie("num"), tie("num")).map(([a, b]) => let_({ x: a }, app("add", v("x"), b))),
    fc.tuple(tie("num"), tie("num")).map(([init, step]) => fold(axes.all, { s: init }, { s: app("add", step, v("s")) }, v("s"))),
  ),
})).num;

/** This function gives the result of `up`, applied `levels` times to a read of a field. */
function repeat(levels: number, up: (e: Expr, level: number) => Expr): Expr {
  let e: Expr = n;
  for (let i = 0; i < levels; i++) e = up(e, i);
  return e;
}

/** This function gives the length of the source of a program. */
function lengthOf(e: Expr): number {
  const g = generate(e, OPTIONS);
  return g.ok ? g.source.length : Number.NaN;
}

/** This function gives the most depth of the braces of the source of a program, outside its strings. */
function depthOf(e: Expr): number {
  const g = generate(e, OPTIONS);
  if (!g.ok) return Number.NaN;
  let depth = 0;
  let most = 0;
  let quote: string | undefined;
  for (let i = 0; i < g.source.length; i++) {
    const c = g.source[i];
    if (quote !== undefined) {
      if (c === "\\") i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") most = Math.max(most, ++depth);
    else if (c === "}") depth--;
  }
  return most;
}

/** This function gives the count of the walks of a node in the lowering of a chain of lets. Each let has a catch of its errors. */
function walkOf(levels: number): number {
  const e = repeat(levels, (inner, i) => {
    const name = `x${String(i)}`;
    return let_({ [name]: n }, app("ifError", app("add", inner, v(name)), lit(0)));
  });
  walk.count = 0;
  generate(e, OPTIONS);
  return walk.count;
}

describe("COMPILE.SOURCE.SIZE", () => {
  beforeEach(() => {
    walk.count = 0;
  });

  it("V-089 COMPILE.SOURCE.SIZE: 4 times the lets of a chain give at most 6 times the walk of the lowering", () => {
    expect(walkOf(40)).toBeGreaterThan(0);
    expect(walkOf(160) / walkOf(40)).toBeLessThanOrEqual(6);
  });

  it.each([
    ["chain", 100, (e: Expr) => app("add", e, n)],
    ["loopchain", 40, (e: Expr) => app("sum", each(axes.all, app("add", e, n)))],
  ] as const)("V-089 COMPILE.SOURCE.SIZE: 4 times the levels of %s give at most 4.4 times the source", (_name, levels, up) => {
    expect(lengthOf(repeat(4 * levels, up)) / lengthOf(repeat(levels, up))).toBeLessThanOrEqual(4.4);
  });

  it.each(["wide", "constlet", "chain", "letchain", "letloop"])("V-089 COMPILE.SOURCE.SIZE: 4 times the levels of %s give the same depth of the blocks", (name) => {
    const shape = GROWTH_SHAPES.find((x) => x.name === name);
    expect(shape).toBeDefined();
    const levels = Math.ceil((shape?.small ?? 0) / 4);
    const make = (x: number): Expr => shape?.make(x) ?? n;
    expect(depthOf(make(levels))).toBeLessThan(16);
    expect(depthOf(make(4 * levels))).toBe(depthOf(make(levels)));
  });

  it("V-089 COMPILE.SOURCE.SIZE: a line of the source has no indent, and the two forms differ only in that indent", () => {
    fc.assert(
      fc.property(blocks, (e) => {
        const g = generate(e, OPTIONS);
        fc.pre(g.ok);
        const source = g.ok ? g.source : "";
        const indented = g.ok ? printJs(g.program, factsOf(OPTIONS), true) : "";
        expect(source).not.toMatch(/^ /m);
        expect(indented.replaceAll(/^ +/gm, "")).toBe(source);
      }),
      { numRuns: 100 },
    );
  });
});
