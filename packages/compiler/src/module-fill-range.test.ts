/**
 * A range of `fill` in standalone modules (COMPILE.MODULE.FILL.RANGE). A loop over the axis `list`, `count` and `take`
 * can read the list of `fill(n, v)` only as a range. Then the module makes no array of pairs. It loops over the count,
 * which has the check of `FI`. The values and the errors stay those of the interpreter (P17).
 */
import { app, axes, defineDomain, each, evaluate, fold, isVexList, let_, lit, ref, space, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { id: "string", n: "number", w: "number", b: "boolean" }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain, TextDomain];
/** A domain of numbers with the op `fill`. The op of a domain comes first, so `fill` gives a number. */
const FillOps = defineDomain({
  name: "FillOps",
  is: (u: unknown): u is number => typeof u === "number",
  primitive: "number",
  ops: { fill: { fn: (a: number, b: number): number => a * 10 + b, params: ["number"], returns: "number" } },
});
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const VARS = { a: 2 };
/** The records of the tests. A negative `n` is a bad count, and a zero `w` gives an error of `divide`. */
const RECORDS = [
  { id: "1", n: 3, w: 1, b: true },
  { id: "2", n: -1, w: 0, b: false },
  { id: "0", n: 2, w: 2.5, b: true },
  { id: "x", n: 0, w: -1, b: false },
];

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr, fuse = true): string {
  const m = emitModule(e, { ...OPTIONS, fuse });
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/**
 * This function compares the values of a module with the interpreter at each key (P17), with `fuse` on and off. It
 * gives the source of the module with `fuse`.
 */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): string {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: DOMAINS }));
  const fused = sourceOf(e);
  for (const source of [fused, sourceOf(e, false)]) {
    const loaded = make(source);
    expect(loaded.run(structuredClone(records), VARS)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, loaded.VEX_ERROR) : loaded.VEX_ERROR)));
  }
  return fused;
}

/** This function gives the item at a position of an array, and fails the test when the array has no such item. */
function at<T>(items: readonly T[], i: number): T {
  const item = items[i];
  if (item === undefined) throw new Error(`no item at ${i}`);
  return item;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const b = ref("b");
const ns = each(axes.all, n);
const fill = (count: Expr, value: Expr): Expr => op("fill", count, value);
const take = (list: Expr, count: Expr): Expr => op("take", list, count);
/** A fold over the items of a list, with the names `x` and `i` of the item and its position. */
const over = (list: Expr, step: Expr, axis = axes.list(list)): Expr => fold(axis, { s: lit(0) }, { s: step }, v("s"), undefined, ["x", "i"]);
/** A map over the items of a list, with the names `x` and `i`. */
const map = (list: Expr, body: Expr, axis = axes.list(list)): Expr => each(axis, body, undefined, ["x", "i"]);
const atOrigin = (field: string): Expr => ref(field, [{ t: "origin" }]);

/** The source checks a range with FN or TN. A literal count needs no check. */
const ranged = (source: string): boolean => /\b(?:FN|TN)\(/.test(source);
/** The source makes an array of fill when it has FI. */
const filled = (source: string): boolean => source.includes("function FI(");
/** The fallback of a program: -7 for a value, and the empty list for a list. */
const guard = (e: Expr, list = false): Expr => op("ifError", e, list ? lit(vexList([])) : lit(-7));

describe("COMPILE.MODULE.FILL.RANGE: a range of fill in a module", () => {
  it("COMPILE.MODULE.FILL.RANGE: a fold, an each and count over fill or take of fill make no array (P17)", () => {
    const programs = [
      // The fold of the pack of the tree pilot: only the position of each item.
      over(fill(op("multiply", lit(2), op("count", ns)), lit(0)), op("add", v("s"), v("i"))),
      // The each of the merge of the tree pilot: take of a fill as a range of positions, and a list as the value.
      map(take(fill(lit(4), lit(0)), n), op("multiply", v("i"), lit(10))),
      op("count", take(take(fill(n, w), lit(5)), lit(2))),
      op("count", fill(n, lit("t"))),
      // The item of a range is the value of fill, also a list of the records.
      over(fill(lit(3), w), op("add", v("s"), v("x"))),
      op("sum", map(fill(lit(2), ns), op("count", v("x")))),
      // The reverse order and a test of the origin.
      map(fill(n, lit(1)), v("i"), axes.reverse(axes.list(fill(n, lit(1))))),
      over(fill(lit(3), lit(1)), op("add", v("s"), v("i")), axes.where(axes.list(fill(lit(3), lit(1))), atOrigin("b"))),
    ];
    for (const e of programs) expect(filled(expectSame(e))).toBe(false);
    // The pack of the tree pilot: the loop reads the count of FN, not an array of pairs.
    const pack = sourceOf(at(programs, 0));
    // The count is a constant of the run, so it evaluates once, before the fold.
    expect(pack).toMatch(/const (c\d+) = T\(\(\) => k_number\(\(2\) \* \(n\)\)\);[^]*const (A\d+) = FN\(G\(\1\), 0\);\n\s*let z\d+ = 0;\n\s*for \(let (q\d+) = 0; \3 < \2; \3\+\+\) \{/);
    // A literal count that FI takes, with a value that cannot fail, needs no check.
    expect(sourceOf(at(programs, 1))).toContain(`= TN(4, R[o]["n"]);`);
    for (const count of [lit(1), lit(100_000)]) expect(ranged(expectSame(op("count", fill(count, w)), RECORDS.slice(0, 1)))).toBe(false);
  });

  it("COMPILE.MODULE.FILL.RANGE: the code of the range reads a literal value at each item and keeps each other value in a name", () => {
    // A number, a text and a boolean are their own code.
    expect(expectSame(op("count", fill(n, lit(1))))).toContain(`= FN(R[o]["n"], 1);`);
    expect(expectSame(op("count", fill(n, lit("t"))))).toContain(`= FN(R[o]["n"], "t");`);
    expect(expectSame(op("count", fill(n, lit(true))))).toContain(`= FN(R[o]["n"], true);`);
    // Each other value evaluates once, after the count.
    expect(expectSame(op("count", fill(n, w)))).toMatch(/const (b\d+) = R\[o\]\["n"\];\n\s*const (b\d+) = R\[o\]\["w"\];\n\s*out\[o\] = FN\(\1, \2\);/);
    // The loop over a literal count reads the name of the value.
    expect(expectSame(over(fill(lit(2), w), op("add", v("s"), v("x"))))).toMatch(/const (b\d+) = R\[o\]\["w"\];[^]*= k_number\(\(l\d+\) \+ \(\1\)\)/);
    // The empty fill keeps its own code (COMPILE.MODULE.SIZE.FILL).
    expect(ranged(expectSame(op("count", fill(lit(0), lit(1)))))).toBe(false);
  });

  it("COMPILE.MODULE.FILL.RANGE: a part of a range that is a constant of the run evaluates once, before the loop over the keys", () => {
    // The sum over the records is a constant of the run, and the fold reads the origin at each key.
    const sum = op("sum", ns);
    const programs = [
      over(fill(lit(3), sum), op("add", v("s"), op("add", v("x"), atOrigin("w")))),
      over(fill(sum, lit(1)), op("add", v("s"), atOrigin("w"))),
      over(take(fill(n, lit(1)), sum), op("add", v("s"), atOrigin("w"))),
    ];
    for (const e of programs) {
      const source = expectSame(e);
      expect(ranged(source)).toBe(true);
      // The loop over the keys has no loop over the records.
      expect(at(source.split("const out = new Array"), 1).match(/ < n;/g)).toHaveLength(1);
    }
  });

  it("COMPILE.MODULE.FILL.RANGE: a bad count, a count past the limit and an error of the value give the error of FI (P17)", () => {
    const counts = [lit(-1), lit(-0), lit(1.5), lit(2 ** 53), lit(100_001), lit("2"), b, op("divide", lit(1), lit(0)), op("divide", lit(1), w)];
    for (const count of counts) {
      // The empty fill of -0 has its own code (COMPILE.MODULE.SIZE.FILL), so it needs no check.
      for (const e of [op("count", fill(count, lit(1))), over(fill(count, lit(1)), op("add", v("s"), v("i"))), op("count", take(fill(lit(3), lit(1)), count))]) {
        const source = expectSame(guard(e));
        expect(filled(source)).toBe(false);
        expect(ranged(source) || Object.is((count as { value?: unknown }).value, -0)).toBe(true);
      }
    }
    // An error of the value is the error of fill, also with the count 0. A loop over no items reads no value.
    for (const value of [op("divide", lit(1), w), op("divide", lit(1), lit(0))]) {
      for (const count of [lit(0), lit(2), n]) {
        for (const e of [op("count", fill(count, value)), over(fill(count, value), op("add", v("s"), v("i"))), op("count", take(fill(count, value), lit(1)))]) expectSame(guard(e));
      }
    }
    // The statements of a range can fail, also with a literal count. A branch, a name, a sum and ifError keep the error at its place.
    for (const value of [op("divide", lit(1), w), op("divide", lit(1), lit(0))]) {
      for (const x of [op("count", fill(lit(2), value)), over(fill(lit(2), value), op("add", v("s"), v("i")))]) {
        const places = [
          op("if", b, lit(5), x),
          op("if", b, x, lit(5)),
          op("and", b, op("gt", x, lit(0))),
          op("or", b, op("gt", x, lit(0))),
          let_({ q: x }, op("if", b, lit(3), v("q"))),
          guard(op("add", x, n)),
          op("sum", each(axes.all, x)),
          op("sum", each(axes.all, op("if", b, x, lit(1)))),
        ];
        for (const e of places) expectSame(e);
      }
    }
    // A count of -0 from a record gives the count 0, as the length of the list does.
    const zero = [{ id: "z", n: -0, w: -0, b: true }];
    for (const e of [op("count", fill(n, lit(1))), op("count", take(fill(lit(3), lit(1)), n)), op("count", take(fill(n, w), n)), over(fill(n, w), op("add", v("s"), v("x")))]) expectSame(e, zero);
    // The largest count, at one record: the interpreter makes 100000 items.
    expectSame(op("count", take(fill(lit(100_000), n), lit(100_000))), RECORDS.slice(0, 1));
    expectSame(guard(op("count", take(fill(lit(100_001), n), lit(1)))), RECORDS.slice(0, 1));
  });

  it("COMPILE.MODULE.FILL.RANGE: a list of fill that escapes keeps FI", () => {
    const kept = [
      // A name holds the list, an op reads it, it is a value or the first list of a name of a loop.
      let_({ r: fill(lit(3), n) }, op("count", v("r"))),
      op("nth", fill(lit(3), n), lit(1)),
      op("sum", fill(n, w)),
      fill(lit(2), n),
      fold(axes.all, { l: fill(lit(1), n) }, { l: op("append", v("l"), fill(lit(1), w)) }, op("count", v("l"))),
      // take of a list that is not a range, and fill with an argument after the value.
      op("count", take(op("sortBy", fill(lit(3), n)), lit(2))),
      op("count", op("fill", lit(2), n, lit(5))),
      // count with an option keeps the check of its option.
      op("count", fill(n, lit(1)), lit({ strict: true })),
      // Another list op with two lists.
      op("count", op("append", fill(lit(1), n), fill(lit(2), w))),
      // A key of a node of the memo: the sum over the records reads the count of the list at the origin.
      op("sum", each(axes.where(axes.all, op("eq", n, op("count", take(fill(atOrigin("n"), lit(1)), n)))), w)),
    ];
    for (const [i, e] of kept.entries()) {
      const source = expectSame(guard(e, i === 3));
      expect(filled(source)).toBe(true);
    }
    // A node that is not a literal is not a literal count, also with an extra field "value".
    const field = { ...n, value: 2 } as Expr;
    expect(ranged(expectSame(op("count", fill(field, lit(1)))))).toBe(true);
    expect(expectSame(op("count", fill(lit(3), { ...w, value: "t" } as Expr)))).toMatch(/const (b\d+) = R\[o\]\["w"\];\n\s*out\[o\] = 3;/);
    // A domain with the op fill comes first, so fill gives a number, and take of that number gives a reason.
    const own = emitModule(op("count", take(fill(lit(2), lit(1)), lit(1))), { ...OPTIONS, domains: [...DOMAINS, FillOps] });
    expect(own.ok ? own.source : own.reason).toBe("a list op on a value that is not a list");
    // With fuse false, each fill keeps FI (COMPILE.MODULE.FUSE.OFF).
    const off = sourceOf(op("count", fill(n, lit(1))), false);
    expect(filled(off)).toBe(true);
    expect(ranged(off)).toBe(false);
  });

  it("COMPILE.MODULE.FILL.RANGE P17: random loops and counts over ranges of fill give the values of the interpreter", () => {
    const count = fc.constantFrom(lit(0), lit(1), lit(3), lit(-0), lit(-1), lit(1.5), lit(2 ** 53), lit(100_001), lit("2"), n, b, op("divide", lit(1), w), op("divide", lit(1), lit(0)));
    const value = fc.constantFrom(lit(0), lit(7), w, op("divide", lit(1), w), op("divide", lit(1), lit(0)));
    const range: fc.Arbitrary<Expr> = fc.oneof(
      fc.tuple(count, value).map(([c, x]) => fill(c, x)),
      fc.tuple(count, value, count).map(([c, x, k]) => take(fill(c, x), k)),
      fc.tuple(count, value, count, count).map(([c, x, k, m]) => take(take(fill(c, x), k), m)),
    );
    const program = fc.tuple(range, fc.integer({ min: 0, max: 5 })).map(([r, form]) => {
      const forms: readonly Expr[] = [
        op("count", r),
        over(r, op("add", v("s"), v("i"))),
        over(r, op("add", v("s"), v("x"))),
        op("sum", map(r, op("add", v("i"), v("x")))),
        map(r, v("i"), axes.reverse(axes.list(r))),
        op("count", map(r, lit(1), axes.where(axes.list(r), atOrigin("b")))),
      ];
      return guard(at(forms, form), form === 4);
    });
    let ranges = 0;
    for (const e of fc.sample(program, { seed: 20261105, numRuns: 150 })) {
      const source = expectSame(e);
      if (ranged(source)) ranges++;
    }
    // Most programs have a range with a check. A literal count or the empty fill needs none.
    expect(ranges).toBeGreaterThan(100);
  });
});
