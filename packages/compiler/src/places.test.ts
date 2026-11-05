/** The limit of the places of a program (COMPILE.PLACES): a compile refuses a large program before each walk that takes the time of the places. */
import { app, type AnyDomain, evaluate, type Expr, fn, call, let_, lit, ref, space, v } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { doubling, fromCore } from "@mark1russell7/vex-testkit";
import { describe, expect, it } from "vitest";
import { LINE_MB, namedFaults, OVER_DEPTHS, placesFaults, RECORD_DEPTHS, SHAPES, worstRows, type PlacesRow } from "../test/places.ts";
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

/** This function gives a row of the gate. */
const row = (depth: number, rssMB: number | undefined, shape = "plain"): PlacesRow => ({ mode: "module", shape, depth, rssMB });
/** This function gives a row of each shape, at `more` depths over its largest program. */
const rowsAt = (more: number, rssMB: number | undefined): PlacesRow[] => SHAPES.map(([shape, , depth]) => row(depth + more, rssMB, shape));
/** The rows that keep the rule. */
const GOOD = [...rowsAt(0, LINE_MB), ...rowsAt(OVER_DEPTHS, LINE_MB + 1)];

describe("COMPILE.PLACES: the rule of the limit", () => {
  it("COMPILE.PLACES: each named depth is the largest program of its shape under the limit", () => {
    expect(namedFaults(MAX_PLACES)).toStrictEqual([]);
    for (const [, make, depth] of SHAPES) {
      expect(placesOf([make(depth)])).toBeLessThanOrEqual(MAX_PLACES);
      expect(placesOf([make(depth + 1)])).toBeGreaterThan(MAX_PLACES);
    }
  });

  it("COMPILE.PLACES: a change of the limit or of the count is a fault of the names", () => {
    expect(namedFaults(MAX_PLACES / 2)).toHaveLength(SHAPES.length);
    expect(namedFaults(MAX_PLACES * 2)).toHaveLength(SHAPES.length);
    expect(namedFaults(MAX_PLACES / 2)[0]).toBe("plain at depth 14 has 32767 places, and the next depth has 65535. That is not the largest program under 16384.");
  });

  it("COMPILE.PLACES: the rows keep the rule if the largest programs stay under the line and one row at 4 times goes over it", () => {
    expect(placesFaults(GOOD)).toStrictEqual([]);
    expect(placesFaults([...rowsAt(0, 10), ...rowsAt(OVER_DEPTHS, 10), row(14 + OVER_DEPTHS, undefined)])).toStrictEqual([]);
  });

  it("COMPILE.PLACES: a row of a largest program over the line is a fault", () => {
    expect(placesFaults([...GOOD, row(13, LINE_MB + 1, "constant")])).toStrictEqual(["module constant at depth 13 goes over 1024 MB. Lower MAX_PLACES."]);
    expect(placesFaults([...GOOD, row(13, undefined, "loop")])).toHaveLength(1);
  });

  it("COMPILE.PLACES: rows at 4 times the places that all stay under the line are a fault", () => {
    expect(placesFaults([...rowsAt(0, 10), ...rowsAt(OVER_DEPTHS, LINE_MB)])).toStrictEqual(["each row at 4 times the places stays under 1024 MB. Raise MAX_PLACES."]);
  });

  it("COMPILE.PLACES: a row at 2 times the places passes nothing and fails nothing", () => {
    expect(placesFaults([...GOOD, ...rowsAt(RECORD_DEPTHS, LINE_MB + 1)])).toStrictEqual([]);
    expect(placesFaults([...rowsAt(0, 10), ...rowsAt(RECORD_DEPTHS, LINE_MB + 1), ...rowsAt(OVER_DEPTHS, 10)])).toHaveLength(1);
  });

  it("COMPILE.PLACES: rows without each shape at each depth of the rule are a fault", () => {
    const fault = ["the rows do not have the largest program of each shape and the program of 4 times its places"];
    expect(placesFaults(rowsAt(0, 10))).toStrictEqual(fault);
    expect(placesFaults(rowsAt(OVER_DEPTHS, 10))).toStrictEqual(fault);
    expect(placesFaults(GOOD.filter((r) => r.shape !== "loop"))).toStrictEqual(fault);
  });

  it("COMPILE.PLACES: the worst row of the samples is the largest row, and a sample with no result is the worst", () => {
    expect(worstRows([row(14, 5), row(14, 9), row(14, 7)])).toStrictEqual([row(14, 9)]);
    expect(worstRows([row(14, 5), row(14, undefined), row(14, 7)])).toStrictEqual([row(14, undefined)]);
    expect(worstRows([row(14, 5), row(15, 6)])).toHaveLength(2);
  });
});

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
