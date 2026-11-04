/**
 * The pair test of a standalone module. A fold whose name stops at `and(name, ...)` or `or(name, ...)` leaves its loop
 * when each such name stops. The rest of the targets runs only the steps of the other names. Thus an error of a later
 * target stays the error of the fold. A fold over all the records reads the packs of its columns. Each test compares
 * the module with the interpreter (P17).
 */
import { app, axes, call, each, evaluate, fn, fold, let_, lit, rec, ref, space, v, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { RADIAL_DOMAINS, RADIAL_PROGRAM, RADIAL_SCHEMA, radialRun, type RadialInput } from "../../pilots/src/ireko-radial.ts";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const SCHEMA = { fields: { n: "number", w: "number" }, vars: { a: "number" } } as const;
const DOMAINS = [NumDomain, BoolDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
/** This set has records without an error. Its second record stops a test of `n > -2`. */
const STOP = [
  { n: 3, w: 1 },
  { n: -5, w: 2 },
  { n: 2, w: 2.5 },
];
/** The records of `STOP`, with a record after the stop where `n / w` is an error. */
const STOP_THEN_ERROR = [...STOP, { n: 1, w: 0 }];
/** Twenty records. Where `w` is 0, `n / w` is an error. */
const MANY = Array.from({ length: 20 }, (_x, i) => ({ n: (i % 7) - 2, w: i % 6 === 5 ? 0 : (i % 4) + 0.5 }));
/** The sets of records of each differential test: also an empty set and sets of one record. */
const SETS: readonly (readonly unknown[])[] = [[], [{ n: 3, w: 1 }], [{ n: -5, w: 1 }], [{ n: 1, w: 0 }], STOP, STOP_THEN_ERROR, MANY];

/** This function makes the module of a source with `new Function`. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a program, and fails the test for a program that cannot be a module. */
function sourceOf(e: Expr): string {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function compares the values of the module with the interpreter at each key of each set (P17), and gives the source. */
function expectSame(e: Expr, sets: readonly (readonly unknown[])[] = SETS, a = 2): string {
  const source = sourceOf(e);
  const m = make(source);
  for (const records of sets) {
    const s = space.array(records);
    const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: { a }, domains: DOMAINS }));
    expect(m.run(structuredClone(records), { a })).toStrictEqual(results.map((r) => (r.ok ? r.value : m.VEX_ERROR)));
  }
  return source;
}

/** This function tells if the value of a program is an error at the first key of `records`, in the interpreter. */
const fails = (e: Expr, records: readonly unknown[]): boolean => {
  const s = space.array(records);
  const [origin = ""] = s.keys;
  return !evaluate(e, { space: s, origin, vars: { a: 2 }, domains: DOMAINS }).ok;
};

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const r = v("r");
const ok = v("ok");
const s = v("s");
/** A test that stops at the second record of `STOP`. */
const KEEP = op("gt", n, lit(-2));
/** This function gives a fold over `axis` with the name `ok` that stops at false and the name `s` that adds `n / w`. */
const andSum = (axis = axes.all, result: Expr = ok): Expr => fold(axis, { ok: lit(true), s: lit(0) }, { ok: op("and", ok, KEEP), s: op("add", s, op("divide", n, w)) }, result);
/** The loops of a module source after its first line of code: a `for` loop with a `break` is an exit. */
const exits = (source: string): number => [...source.matchAll(/\bbreak;/g)].length;

describe("COMPILE.MODULE.EXIT: a fold leaves its loop when each name with a stop stops", () => {
  it("COMPILE.MODULE.EXIT: an error of the other names after the stop is the error of the fold", () => {
    const e = andSum();
    expect(fails(e, STOP_THEN_ERROR)).toBe(true);
    expect(fails(e, STOP)).toBe(false);
    const source = expectSame(e);
    // The rest of the targets runs the step of `s` only, in a loop that goes on from the next target.
    expect(source).toMatch(/if \(!l\d+\) \{\n\s+for \(j\d+\+\+; j\d+ < n; j\d+\+\+\) \{/);
    expect(exits(source)).toBeGreaterThan(0);
  });

  it("COMPILE.MODULE.EXIT: a number that overflows after the stop is the error of the fold", () => {
    const e = fold(axes.all, { ok: lit(true), p: lit(1) }, { ok: op("and", ok, KEEP), p: op("multiply", v("p"), lit(1e200)) }, ok);
    expect(fails(e, STOP)).toBe(true);
    expectSame(e);
    expectSame(e, [[{ n: -5, w: 1 }], [{ n: -5, w: 1 }, { n: 1, w: 1 }]]);
  });

  it("COMPILE.MODULE.EXIT: after the stop, the other arguments of the stopped name do not evaluate", () => {
    // `n / w` is an error at the second record, but `ok` is false there, so `and` does not read it.
    const e = fold(axes.all, { ok: lit(true) }, { ok: op("and", ok, op("gt", op("divide", n, w), lit(-2))) }, ok);
    const late = [{ n: -5, w: 1 }, { n: 1, w: 0 }];
    expect(fails(e, late)).toBe(false);
    expectSame(e, [...SETS, late, [{ n: 1, w: 0 }, { n: -5, w: 1 }]]);
  });

  it("COMPILE.MODULE.EXIT: a name of `or` stops at true, and a loop with no other steps leaves at once", () => {
    const e = fold(axes.all, { hit: lit(false) }, { hit: op("or", v("hit"), op("gt", n, lit(2))) }, v("hit"));
    const source = expectSame(e);
    expect(source).toMatch(/if \(l\d+\) break;/);
  });

  it("COMPILE.MODULE.EXIT: a safe step that the result does not read leaves at once, and a read keeps the rest", () => {
    const quiet = fold(axes.all, { ok: lit(true), last: lit(0) }, { ok: op("and", ok, KEEP), last: n }, ok);
    expect(expectSame(quiet)).toMatch(/if \(!l\d+\) break;/);
    const read = fold(axes.all, { ok: lit(true), last: lit(0) }, { ok: op("and", ok, KEEP), last: n }, rec({ ok, last: v("last") }));
    const source = expectSame(read);
    expect(source).not.toMatch(/if \(!l\d+\) break;/);
    expect(source).toMatch(/for \(j\d+\+\+; j\d+ < n; j\d+\+\+\)/);
  });

  it("COMPILE.MODULE.EXIT: two names with a stop leave the loop only when both stop", () => {
    const e = fold(axes.all, { ok: lit(true), up: lit(false), s: lit(0) }, { ok: op("and", ok, KEEP), up: op("or", v("up"), op("gt", n, lit(2))), s: op("add", s, op("divide", n, w)) }, rec({ ok, up: v("up") }));
    expect(expectSame(e)).toMatch(/if \(!l\d+ && l\d+\) \{/);
  });

  it("COMPILE.MODULE.EXIT AXIS.WHERE AXIS.REVERSE: the rest of the targets keeps the order, the tests and the skip of the axis", () => {
    // An error of the test after the stop is an error of the fold.
    const where = andSum(axes.where(axes.all, op("gte", op("divide", n, w), lit(-10))));
    expect(fails(where, STOP_THEN_ERROR)).toBe(true);
    expectSame(where);
    const reverse = expectSame(andSum(axes.reverse(axes.all)));
    expect(reverse).toMatch(/for \(j\d+--; j\d+ >= 0; j\d+--\)/);
    expectSame(andSum(axes.others));
    expectSame(andSum(axes.window(-1, 2)));
  });

  it("COMPILE.MODULE.EXIT AXIS.LIST.ITEM: a fold over a list with error items keeps the errors of the interpreter", () => {
    const list = each(axes.all, op("divide", n, w));
    const e = fold(axes.list(list), { ok: lit(true), s: lit(0) }, { ok: op("and", ok, op("gt", v("x"), lit(-2))), s: op("add", s, v("x")) }, ok, undefined, ["x"]);
    expectSame(e);
  });

  it("COMPILE.MODULE.EXIT COMPILE.MODULE.APPEND.OWN: a fold with an append into its own list has no exit", () => {
    const xs = v("xs");
    const e = fold(axes.all, { ok: lit(true), xs: op("fill", lit(0), lit(0)) }, { ok: op("and", ok, KEEP), xs: op("append", xs, op("fill", lit(1), n)) }, rec({ ok, c: op("count", xs) }));
    expect(exits(expectSame(e))).toBe(0);
  });

  it("COMPILE.MODULE.EXIT: a step that is not `and` or `or` of its own name has no exit", () => {
    const steps: readonly Expr[] = [op("and", KEEP, ok), op("not", ok), op("and", op("not", ok), KEEP), op("and", v("other"), KEEP)];
    for (const step of steps) {
      const e = fold(axes.all, { ok: lit(true), other: lit(true) }, { ok: step, other: v("other") }, ok);
      expect(exits(expectSame(e))).toBe(0);
    }
  });
});

/** The need of a record: a column of the run. `n / w` is an error where `w` is 0. */
const NEED = op("add", op("multiply", n, w), op("divide", n, w));
/** The step of a record: a column of each call. It is an error for `r` = 1 only. */
const STEP = op("divide", call("need"), op("subtract", r, lit(1)));
/** The test of the pairs of a record: each of the next records in a window must keep a distance. */
const WINDOW = fold(axes.window(1, 3), { apart: lit(true) }, { apart: op("and", v("apart"), op("not", op("lt", op("add", call("step", r), v("$a")), v("acc")))) }, v("apart"));
/** A pair test as in the radial pilot. The sum `acc` of the steps is a name with no stop. */
const PAIRS = fn(["r"], fold(axes.all, { acc: lit(0), ok: lit(true) }, { acc: op("add", v("acc"), call("step", r)), ok: op("and", ok, let_({ $a: call("step", r) }, WINDOW)) }, ok));
/** This function gives the program `body` with the functions of the pair test. */
const pairsOf = (body: Expr, pairs: Expr = PAIRS): Expr => let_({ need: fn([], NEED) }, let_({ step: fn(["r"], STEP) }, let_({ pairs }, body)));

describe("COMPILE.MODULE.PAIRS: a fold over all the records reads the packs of its columns", () => {
  it("COMPILE.MODULE.PAIRS: the pair test reads the pack of the column of its call in each loop", () => {
    const e = pairsOf(rec({ a: call("pairs", lit(3)), b: call("pairs", op("add", n, lit(4))) }));
    const source = expectSame(e);
    expect(source).toMatch(/let PK\d+;\n(?:.*\n)*?\s+const pk\d+ = PK\d+ \|\| \(PK\d+ = QA\(n, col\d+\)\);/);
    // Each read of the column in the two loops is a read of the pack.
    expect([...source.matchAll(/QA\(n, col\d+\)/g)].length).toBe(1);
    expect([...source.matchAll(/G\(pk\d+\[j\d+\]\)/g)].length).toBeGreaterThanOrEqual(3);
    expect(exits(source)).toBeGreaterThan(0);
  });

  it("COMPILE.MODULE.PAIRS: an error of the column of a call is the error of the pair test, at each parameter", () => {
    const e = pairsOf(rec({ a: call("pairs", v("a")), b: call("pairs", lit(3)) }));
    expectSame(e, SETS, 1);
    expectSame(e, SETS, 2);
  });

  it("COMPILE.MODULE.PAIRS: a fold of another function reads no pack of the columns of the pair test", () => {
    const total = fn(["r"], fold(axes.all, { s: lit(0) }, { s: op("add", s, call("step", r)) }, s));
    const e = let_({ need: fn([], NEED) }, let_({ step: fn(["r"], STEP) }, let_({ pairs: PAIRS, total }, rec({ a: call("pairs", lit(3)), b: call("total", op("add", n, lit(4))), c: call("total", lit(3)) }))));
    // The function `total` has no loop in a loop, so its calls have no column, and only the pair test has a pack.
    expect([...expectSame(e).matchAll(/QA\(n, col\d+\)/g)].length).toBe(1);
  });

  it("COMPILE.MODULE.PAIRS: a function that reads a name of the place of its binding keeps the first print, and its values", () => {
    // The function `near` reads the parameter `r`, so its body stays in its function and the second print stops.
    const steps = { acc: op("add", v("acc"), op("add", call("step", r), call("near", v("acc")))), ok: op("and", ok, let_({ $a: call("step", r) }, WINDOW)) };
    const near = fn(["r"], let_({ near: fn(["q"], op("multiply", v("q"), r)) }, fold(axes.all, { acc: lit(0), ok: lit(true) }, steps, ok)));
    const source = expectSame(pairsOf(rec({ a: call("pairs", lit(3)), b: call("pairs", op("add", n, lit(4))) }), near));
    expect(source).not.toContain("QA(n,");
    expect(exits(source)).toBeGreaterThan(0);
  });

  it("COMPILE.MODULE.PAIRS: a fast sum reads the column of its call, not a pack", () => {
    // The function has a loop in a loop, so `step(r)` is a column of each call. The fast sum reads only the packs of the run.
    const inner = op("sum", each(axes.all, op("sum", each(axes.window(1, 2), n))));
    const total = fn(["r"], op("add", op("sum", each(axes.all, call("step", r))), inner));
    const e = let_({ need: fn([], NEED) }, let_({ step: fn(["r"], STEP) }, let_({ total }, rec({ a: call("total", lit(3)), b: call("total", op("add", n, lit(4))) }))));
    const source = expectSame(e);
    expect(source).toMatch(/G\(col\d+\(j\d+\)\)/);
    expect(source).not.toContain("QA(n,");
  });

  it("COMPILE.MODULE.PAIRS: a fold over a test, or with a name that holds a list, keeps its first print", () => {
    const where = let_({ need: fn([], NEED) }, let_({ f: fn(["r"], fold(axes.where(axes.all, op("gt", r, lit(0))), { s: lit(0) }, { s: op("add", s, call("need")) }, s)) }, call("f", n)));
    expect(expectSame(where)).not.toContain("QA(n,");
    const list = let_({ need: fn([], NEED) }, let_({ f: fn(["r"], fold(axes.all, { xs: op("fill", lit(0), lit(0)) }, { xs: op("fill", lit(1), op("add", r, call("need"))) }, op("count", v("xs")))) }, call("f", n)));
    expect(expectSame(list)).not.toContain("QA(n,");
  });
});

/** This function gives a ring of the radial pilot with the sizes `sizes`. */
const ringOf = (sizes: readonly number[]): RadialInput => ({
  mode: "nested",
  self: { width: 40, height: 30 },
  gap: 8,
  options: { startAngle: -90, sweep: 360, clockwise: true, distance: 0 },
  children: sizes.map((size) => ({ box: { width: size, height: size }, extent: { x: 0, y: 0, width: size, height: size } })),
});

describe("COMPILE.MODULE.PAIRS COMPILE.MODULE.EXIT: the pair test of the radial pilot", () => {
  const m = emitModule(RADIAL_PROGRAM, { domains: RADIAL_DOMAINS, schema: RADIAL_SCHEMA, name: "radial" });
  if (!m.ok) throw new Error(m.reason);
  const source = m.source;

  it("COMPILE.MODULE.PAIRS COMPILE.MODULE.EXIT: the test of a radius is a loop over packs, with an exit at the first pair that is too close", () => {
    // The function of the test of a radius is the function with the rest of the inner loop.
    const start = source.search(/for \(j\d+\+\+; j\d+ < h\d+; j\d+\+\+\) \{/);
    expect(start).toBeGreaterThan(0);
    const body = source.slice(source.lastIndexOf("\n  const fn", start), source.indexOf("\n  };\n", start));
    // The packs of the angle steps and of the radii.
    expect([...body.matchAll(/const pk\d+ = PK\d+ \|\| \(PK\d+ = QA\(n, col\d+\)\);/g)].length).toBe(2);
    // The function of the pair test is inline, and the loops call no function at a child.
    expect(body).not.toMatch(/\bfn\d+\(j\d+/);
    // Each fold leaves at its stop: the rest of each loop adds only the angles.
    expect([...body.matchAll(/\bbreak;/g)].length).toBe(2);
    expect(body).toMatch(/for \(j\d+\+\+; j\d+ < h\d+; j\d+\+\+\) \{/);
    expect(body).toMatch(/for \(j\d+\+\+; j\d+ < n; j\d+\+\+\) \{/);
  });

  it("COMPILE.MODULE.PAIRS COMPILE.MODULE.EXIT: the module gives the values and the errors of the interpreter on small rings", () => {
    // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in the build of ireko.
    const radial = new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { radial, VEX_ERROR };`)() as { readonly radial: Run; readonly VEX_ERROR: unknown };
    // A ring of one child, a full ring, a ring whose children are too large, and a child whose size is not finite.
    for (const sizes of [[30], [20, 50, 35], [400, 300, 350], [20, Number.POSITIVE_INFINITY, 30]]) {
      const { space: ring, vars } = radialRun(ringOf(sizes));
      const want = ring.keys.map((origin) => {
        const x = evaluate(RADIAL_PROGRAM, { space: ring, origin, vars, domains: RADIAL_DOMAINS });
        return x.ok ? x.value : radial.VEX_ERROR;
      });
      expect(radial.radial(structuredClone(ring.records), vars)).toStrictEqual(want);
    }
  });
});
