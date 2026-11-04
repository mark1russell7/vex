/** The limit of the places of a program (COMPILE.PLACES): a compile refuses a large program before each walk that takes the time of the places. */
import { app, type AnyDomain, axes, each, evaluate, type Expr, fn, call, let_, lit, ref, space, v } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { doubling, fromCore } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type ModuleOptions } from "./module.ts";
import { generate, tiered } from "./tiers.ts";
import { MAX_PLACES, placesError, placesOf } from "./unshared.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain];
const SCHEMA = { fields: { n: "number" } } as const;
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: SCHEMA };
const n = ref("n");

/** The most milliseconds of a refusal. The count visits each object once, so a program of 41 objects takes far less. */
const REFUSAL_MS = 1000;

/** The first depth with more places than the limit. */
const OVER = Math.ceil(Math.log2(MAX_PLACES));

/** This function gives a doubling in which each level is a loop. */
function loops(depth: number): Expr {
  let e: Expr = n;
  for (let i = 0; i < depth; i++) e = app("sum", each(axes.all, app("add", e, e)));
  return e;
}

/** The doubling programs of the measures: the leaf is a read, a constant of the run, or each level is a loop. */
const SHAPES: readonly (readonly [string, (depth: number) => Expr])[] = [
  ["plain", (depth) => doubling(n, depth)],
  ["constant", (depth) => doubling(app("sum", each(axes.all, n)), depth)],
  ["loop", loops],
];

function reasonOf(r: { readonly ok: true } | { readonly ok: false; readonly reason: string }): string | undefined {
  return r.ok ? undefined : r.reason;
}

/** The entries of a compile, each with its reason. */
const ENTRIES: readonly (readonly [string, (e: Expr) => string | undefined])[] = [
  ["module", (e) => reasonOf(emitModule(e, OPTIONS))],
  ["module with keys", (e) => reasonOf(emitModule(e, { ...OPTIONS, keys: true }))],
  ["module without fuse", (e) => reasonOf(emitModule(e, { ...OPTIONS, fuse: false }))],
  ["module with faults as values", (e) => reasonOf(emitModule(e, { ...OPTIONS, faults: "value" }))],
  ["sheet", (e) => reasonOf(emitSheetModule(new Map([["p", e]]), { ...OPTIONS, kinds: { p: "number" } }))],
  ["tier 2", (e) => reasonOf(generate(e, { domains: DOMAINS, schema: SCHEMA }))],
];

/** This function gives a program with one object at each place and with `places` places. */
const sized = (places: number): Expr => app("add", ...Array.from({ length: places - 1 }, () => ref("n")));

const DEPTHS = [10, 20, 30, 40].filter((depth) => depth >= OVER);
const CASES = ENTRIES.flatMap(([entry, compile]) => SHAPES.flatMap(([shape, make]) => DEPTHS.map((depth) => [entry, shape, depth, compile, make] as const)));

describe("COMPILE.PLACES: a compile counts the places of a program first", () => {
  it("COMPILE.PLACES: a shared object counts once for each place, and the walk visits each object once", () => {
    expect(placesOf([doubling(n, 3)])).toBe(15);
    expect(placesOf([doubling(n, 40)])).toBe(2 ** 41 - 1);
    expect(placesOf([doubling(n, 2000)])).toBe(Infinity);
    const shared = app("add", n, n);
    expect(placesOf([shared, shared])).toBe(6);
    expect(placesOf([])).toBe(0);
  });

  it("COMPILE.PLACES: an object that holds itself has an infinite count", () => {
    const args: Expr[] = [n];
    const loop: Expr = { tag: "app", op: "add", args };
    args.push(loop);
    expect(placesOf([loop])).toBe(Infinity);
  });

  it("COMPILE.PLACES: the error has its code, the count and the limit", () => {
    const big = doubling(n, OVER);
    expect(placesError([big])).toBe(`COMPILE.PLACES: the program has ${String(2 ** (OVER + 1) - 1)} places, and the limit is ${String(MAX_PLACES)}`);
    expect(placesError([doubling(n, OVER - 1)])).toBeUndefined();
  });

  it("COMPILE.PLACES: a program at the limit has no refusal, and one place more has the refusal", () => {
    expect(placesOf([sized(MAX_PLACES)])).toBe(MAX_PLACES);
    expect(placesError([sized(MAX_PLACES)])).toBeUndefined();
    expect(placesError([sized(MAX_PLACES + 1)])).toContain("COMPILE.PLACES");
  });

  it.each(CASES)("COMPILE.PLACES: %s refuses the shape %s at the depth %d in time", (_entry, _shape, depth, compile, make) => {
    const e = make(depth);
    const start = performance.now();
    const reason = compile(e);
    expect(performance.now() - start).toBeLessThan(REFUSAL_MS);
    expect(reason).toBe(placesError([e]));
    expect(reason).toContain("COMPILE.PLACES");
  });

  it("COMPILE.PLACES: a sheet counts its columns and its cells", () => {
    const half = doubling(n, OVER - 1);
    const sheet = { ...OPTIONS, kinds: { p: "number", q: "number" } } as const;
    expect(reasonOf(emitSheetModule(new Map([["p", half], ["q", half]]), sheet))).toContain("COMPILE.PLACES");
    expect(reasonOf(emitSheetModule(new Map([["p", half]]), { ...sheet, cells: new Map([["q", new Map([["0", half]])]]) }))).toContain("COMPILE.PLACES");
  });

  it("COMPILE.PLACES: the form with names has few places, so a compile takes it", () => {
    let body: Expr = v(`x${String(40)}`);
    for (let i = 40; i > 0; i--) body = let_({ [`x${String(i)}`]: app("add", v(`x${String(i - 1)}`), v(`x${String(i - 1)}`)) }, body);
    const named = let_({ x0: lit(0) }, body);
    expect(placesOf([named])).toBeLessThan(MAX_PLACES);
    const m = emitModule(named, OPTIONS);
    expect(m.ok && m.source.length).toBeLessThan(MAX_PLACES);
  });

  it("COMPILE.PLACES: tier 1 runs a program that tier 2 refuses, with the value of the interpreter", () => {
    const e = doubling(n, OVER);
    const records = [{ n: 1 }, { n: 2 }];
    const s = space.array(records);
    const fast = tiered(e, { domains: DOMAINS, schema: SCHEMA });
    expect(fast.tier).toBe(1);
    expect(fast.reason).toBe(placesError([e]));
    const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: {}, domains: DOMAINS }));
    expect(s.keys.map((origin) => fromCore(fast.run({ space: s, origin, vars: {} })))).toStrictEqual(results.map((r) => fromCore(r)));
  });

  it("COMPILE.PLACES: a function counts its body at its binding, not at each call", () => {
    const body = doubling(n, 3);
    const e = let_({ f: fn(["x"], body) }, app("add", call("f", lit(1)), call("f", lit(2))));
    expect(placesOf([e])).toBe(15 + 7);
  });
});
