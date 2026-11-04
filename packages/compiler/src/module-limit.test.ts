/**
 * The cost of a data limit in a standalone module (COMPILE.MODULE.LIMIT.ONCE). A limit that reads no key is a constant
 * of the run. Thus a walk that stops early does not pay for a count at each key. A getter on a field counts the reads
 * of the records, so these tests read no time. The values and the errors stay the values of the interpreter (P17).
 */
import { app, axes, call, dataLimit, each, evaluate, fn, iterate, let_, lit, ref, space, v, type Axis, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, type ModuleOptions } from "./module.ts";

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain], schema: { fields: { n: "number", b: "boolean" }, vars: {} } };
const RECORDS = Array.from({ length: 12 }, (_x, i) => ({ n: i % 5, b: i % 3 !== 1 }));

/** This function makes the module of a program with `new Function`. */
function make(e: Expr): Loaded {
  const m = emitModule(e, OPTIONS);
  if (!m.ok) throw new Error(m.reason);
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitModule, as in a build.
  return new Function(`${m.source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the values of the interpreter at each key, with `error` for an error. */
function interpreted(e: Expr, error: unknown): readonly unknown[] {
  const s = space.array(RECORDS);
  return s.keys.map((origin) => {
    const r = evaluate(e, { space: s, origin, vars: {}, domains: OPTIONS.domains ?? [] });
    return r.ok ? r.value : error;
  });
}

/** This function gives the count of reads of the field `b` in a run of the module. Each record has a getter for it. */
function readsOf(e: Expr): number {
  let reads = 0;
  const rows = RECORDS.map((r) => ({
    n: r.n,
    get b(): boolean {
      reads++;
      return r.b;
    },
  }));
  make(e).run(rows, {});
  return reads;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const b = ref("b");
/** The count of a loop: a step for each target of the axis. The first value reads the key, so the loop is not a constant of the run. */
const steps = (axis: Axis, until?: Expr): Expr => iterate(dataLimit(axis), { i: op("subtract", n, n) }, { i: op("add", v("i"), lit(1)) }, v("i"), until);
const ONE_PASS = RECORDS.length;
/** The module checks each field of each record one time before the first key. */
const CHECKS = RECORDS.length;
const BY_TEST = axes.where(axes.all, b);
const BY_ITEM = axes.where(axes.list(each(axes.all, n)), b);
/** A list with an error item at each record with `n` 0. */
const BROKEN = axes.list(each(axes.all, op("divide", lit(1), n)));

describe("COMPILE.MODULE.LIMIT.ONCE: a data limit that reads no key", () => {
  it("COMPILE.MODULE.LIMIT.ONCE ITERATE.LIMIT.DATA: the module reads the targets one time for each run, and each key gets the count", () => {
    for (const e of [steps(BY_TEST), steps(BY_ITEM)]) {
      expect(readsOf(e)).toBe(CHECKS + ONE_PASS);
      const loaded = make(e);
      expect(loaded.run(RECORDS, {})).toStrictEqual(interpreted(e, loaded.VEX_ERROR));
    }
  });

  it("COMPILE.MODULE.LIMIT.ONCE: a walk that stops at its first test reads the targets one time", () => {
    expect(readsOf(steps(BY_TEST, op("eq", v("i"), lit(0))))).toBe(CHECKS + ONE_PASS);
  });

  it("COMPILE.MODULE.LIMIT.ONCE: two loops with the same limit read the targets one time", () => {
    expect(readsOf(op("add", steps(BY_TEST), steps(BY_TEST, op("gt", v("i"), lit(1)))))).toBe(CHECKS + ONE_PASS);
  });

  it("COMPILE.MODULE.LIMIT.ONCE: a key that does not reach the limit does not start the count", () => {
    const reachedBy = (test: Expr): Expr => op("if", test, steps(BY_TEST), lit(-1));
    expect(readsOf(reachedBy(op("lt", n, lit(0))))).toBe(CHECKS);
    expect(readsOf(reachedBy(op("gt", n, lit(3))))).toBe(CHECKS + ONE_PASS);
    const e = reachedBy(op("gt", n, lit(3)));
    const loaded = make(e);
    expect(loaded.run(RECORDS, {})).toStrictEqual(interpreted(e, loaded.VEX_ERROR));
  });

  it("COMPILE.MODULE.LIMIT.ONCE ITERATE.LIMIT.ERROR: a limit that is not valid is the error of each key that reaches it, before the first test", () => {
    const programs = [
      steps(BROKEN),
      steps(BROKEN, op("eq", v("i"), lit(0))),
      op("ifError", steps(BROKEN, op("eq", v("i"), lit(0))), lit(-1)),
      op("if", op("gt", n, lit(3)), steps(BROKEN), n),
      steps(axes.list(op("append", op("fill", lit(100_000), lit(0)), op("fill", lit(1), lit(1)))), op("eq", v("i"), lit(0))),
    ];
    for (const e of programs) {
      const loaded = make(e);
      expect(loaded.run(RECORDS, {})).toStrictEqual(interpreted(e, loaded.VEX_ERROR));
    }
  });
});

describe("a data limit that reads a key", () => {
  it("ITERATE.LIMIT.DATA: each key keeps its own count", () => {
    const programs = [
      steps(axes.list(op("fill", n, lit(0)))),
      steps(axes.where(axes.all, op("lt", n, ref("n", [{ t: "origin" }])))),
      let_({ f: fn(["xs"], steps(axes.list(v("xs")))) }, op("add", call("f", op("fill", lit(1), lit(0))), call("f", op("fill", lit(3), lit(0))))),
    ];
    for (const e of programs) {
      const loaded = make(e);
      expect(loaded.run(RECORDS, {})).toStrictEqual(interpreted(e, loaded.VEX_ERROR));
    }
  });

  it("ITERATE.LIMIT.DATA: the test of a limit that reads the origin evaluates at each key", () => {
    expect(readsOf(steps(axes.where(axes.all, op("and", b, op("gte", n, ref("n", [{ t: "origin" }]))))))).toBe(CHECKS + ONE_PASS * ONE_PASS);
  });
});
