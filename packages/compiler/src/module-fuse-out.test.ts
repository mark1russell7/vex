/**
 * The value of a run as a list (docs/COMPILER.md §7.6, step 7). A list of a result is a frozen `vex.list`, as the
 * interpreter gives (COMPILE.MODULE.LIST.RESULT). With `fuse`, a value that reads no key has one `vex.list` for each run,
 * and each key gets that object (COMPILE.MODULE.FUSE.OUT).
 */
import * as fc from "fast-check";
import { app, axes, each, evaluate, isVexList, let_, lit, ref, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { NumDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, type Emitted, type ModuleOptions, type SheetModuleOptions } from "./module.ts";

const OPTIONS: ModuleOptions = { domains: [NumDomain], schema: { fields: { n: "number", w: "number" } } };
const RECORDS = [
  { n: 3, w: 1 },
  { n: -1, w: 0 },
  { n: 2, w: 2 },
];

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });

/** A list that reads no key and that has no error item: the value of `n` at each record. */
const COLUMN = each(axes.all, n);
/** A list that reads no key and that has an error item at the record with `w` 0. */
const FAILED = each(axes.all, op("divide", lit(1), ref("w")));
/** A list that reads no key and fails at each key, because a text and a number have no order (LIST.SORT). */
const NEVER = op("sortBy", lit(vexList([item("0", 1), item("1", "a")])));
/** A list that depends on the key. */
const KEYED = op("fill", lit(2), n);

type Run = (records: unknown, vars: unknown, parents?: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** This function gives the source of a module, and fails the test for a program that cannot be a module. */
function sourceOf(m: Emitted): string {
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the module of a program. */
const moduleOf = (e: Expr, options: ModuleOptions = OPTIONS): Loaded => make(sourceOf(emitModule(e, options)));

/** This function gives the values of a program at each key of the records. */
const valuesOf = (e: Expr, options: ModuleOptions = OPTIONS): readonly unknown[] => moduleOf(e, options).run(RECORDS, {});

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (!isVexList(value)) return value;
  return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
}

/** This function gives the values of the interpreter at each key, and the values of the modules of fuse true and of fuse false. */
function sides(e: Expr, records: readonly unknown[]): readonly { readonly expected: unknown; readonly got: unknown }[] {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, domains: OPTIONS.domains ?? [] }));
  return [true, false].map((fuse) => {
    const m = moduleOf(e, { ...OPTIONS, fuse });
    return { expected: results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)), got: m.run(structuredClone(records), {}) };
  });
}

/** This function tells if a value of a module is a list. An error item of a module has the error `VEX_ERROR`, so `isVexList` does not accept it. */
const isList = (u: unknown): u is { readonly items: readonly ListItem[] } => typeof u === "object" && u !== null && (u as { readonly kind?: unknown }).kind === "vex.list";

/** This function tells if a value is a frozen `vex.list`, and each list of its items too. */
function frozen(value: unknown): boolean {
  return isList(value) && Object.isFrozen(value) && Object.isFrozen(value.items) && value.items.every((x) => !x.result.ok || !isList(x.result.value) || frozen(x.result.value));
}

/** This function gives the count of the different objects in a list of values. */
const distinct = (values: readonly unknown[]): number => new Set(values).size;

describe("COMPILE.MODULE.LIST.RESULT: a list of a result is frozen", () => {
  it("COMPILE.MODULE.LIST.RESULT: a list at each key is a frozen vex.list, in the form with and without error items", () => {
    const lists = [KEYED, each(axes.window(-1, 1), op("divide", lit(1), ref("w"))), op("fill", lit(2), KEYED)];
    expect(lists.flatMap((e) => valuesOf(e)).every((x) => frozen(x))).toBe(true);
  });

  it("COMPILE.MODULE.LIST.RESULT: fuse false gives the frozen form too, so the option changes no contract", () => {
    const lists = [KEYED, COLUMN, FAILED, op("fill", lit(2), COLUMN)];
    const values = lists.flatMap((e) => valuesOf(e, { ...OPTIONS, fuse: false }));
    expect(values.every((x) => frozen(x))).toBe(true);
  });

  it("COMPILE.MODULE.LIST.RESULT: an error item of a frozen list has the error VEX_ERROR, and a change of the list throws", () => {
    const m = moduleOf(FAILED);
    const [value] = m.run(RECORDS, {}) as readonly { readonly items: ListItem[] }[];
    expect(value?.items[1]).toStrictEqual({ key: "1", result: { ok: false, error: m.VEX_ERROR } });
    expect(() => value?.items.pop()).toThrow(TypeError);
  });

  it("COMPILE.MODULE.LIST.RESULT: a column of lists of a sheet holds a frozen vex.list in each cell", () => {
    const options: SheetModuleOptions = { ...OPTIONS, kinds: {} };
    for (const formula of [KEYED, FAILED]) {
      const m = make(sourceOf(emitSheetModule(new Map([["A", formula]]), options)));
      const { A } = m.run(RECORDS, {}) as unknown as { readonly A: readonly unknown[] };
      expect(A.every((x) => frozen(x))).toBe(true);
    }
  });
});

describe("COMPILE.MODULE.FUSE.OUT: one vex.list for each run", () => {
  it("COMPILE.MODULE.FUSE.OUT: a value that reads no key is one frozen object at each key", () => {
    const lists = [COLUMN, FAILED, op("flat", each(axes.all, op("fill", lit(1), n))), let_({ ys: COLUMN }, op("append", v("ys"), v("ys"))), op("fill", lit(2), COLUMN), lit(vexList([item("a", 1), errorItem("b")]))];
    const values = lists.map((e) => valuesOf(e));
    expect(values.map((x) => distinct(x))).toStrictEqual(lists.map(() => 1));
    expect(values.map((x) => x.length)).toStrictEqual(lists.map(() => RECORDS.length));
    expect(values.every((x) => frozen(x[0]))).toBe(true);
  });

  it("COMPILE.MODULE.FUSE.OUT: the module prints one envelope before the loop over the keys, and no property on the array", () => {
    const source = sourceOf(emitModule(COLUMN, OPTIONS));
    expect(source).toMatch(/const c\d+ = L\(\(\) => \{\n\s+return LOC\(/);
    expect(source).toMatch(/out\[o\] = G\(c\d+\(\)\);/);
    expect(source).not.toContain(".vl");
  });

  it("COMPILE.MODULE.FUSE.OUT: each run has its own object, and a second run reads its own records", () => {
    const m = moduleOf(COLUMN);
    const [first] = m.run(RECORDS, {});
    const [second] = m.run([{ n: 9, w: 1 }], {});
    expect(first).not.toBe(second);
    expect((second as { readonly items: readonly ListItem[] }).items).toStrictEqual([item("0", 9)]);
  });

  it("COMPILE.MODULE.FUSE.OUT: a value that fails gives VEX_ERROR at each key, and a run without keys gives no value", () => {
    const m = moduleOf(NEVER);
    expect(m.run(RECORDS, {})).toStrictEqual(RECORDS.map(() => m.VEX_ERROR));
    expect(m.run([], {})).toStrictEqual([]);
  });

  it("COMPILE.MODULE.FUSE.OUT: a value that reads the key keeps one object for each key", () => {
    const values = valuesOf(KEYED);
    expect(distinct(values)).toBe(RECORDS.length);
    expect(sourceOf(emitModule(KEYED, OPTIONS))).toMatch(/out\[o\] = LOC\(/);
  });

  it("COMPILE.MODULE.FUSE.OUT COMPILE.MODULE.FUSE.OFF: with fuse false, each key makes its own envelope", () => {
    const off = { ...OPTIONS, fuse: false };
    expect(distinct(valuesOf(COLUMN, off))).toBe(RECORDS.length);
    expect(sourceOf(emitModule(COLUMN, off))).toMatch(/out\[o\] = LO\(/);
  });

  it("COMPILE.MODULE.FUSE.OUT COMPILE.MODULE.LIST.PLAIN: a plain array stays one new array for each key, and it is not frozen", () => {
    const values = valuesOf(COLUMN, { ...OPTIONS, lists: "plain" });
    expect(distinct(values)).toBe(RECORDS.length);
    expect(values.some((x) => Object.isFrozen(x))).toBe(false);
  });

  it("COMPILE.MODULE.FUSE.OUT: a module of a tree space gives one object at each key", () => {
    const values = moduleOf(COLUMN, { ...OPTIONS, space: "tree" }).run(RECORDS, {}, [-1, 0, 0]);
    expect(values).toHaveLength(RECORDS.length);
    expect(distinct(values)).toBe(1);
  });

  it("COMPILE.MODULE.FUSE.OUT: a run of a value that is not a list has no envelope", () => {
    const source = sourceOf(emitModule(op("count", COLUMN), OPTIONS));
    expect(source).not.toMatch(/\bLOC?\(/);
  });
});

describe("COMPILE.MODULE.FUSE.OUT P17: random values that read no key", () => {
  const base = fc.constantFrom(COLUMN, FAILED, KEYED, lit(vexList([item("a", 1), errorItem("b")])), op("fill", lit(2), lit(1)), lit(vexList([])));
  const list = fc.oneof(
    base,
    fc.tuple(base, base).map(([a, b]) => op("append", a, b)),
    base.map((a) => op("flat", each(axes.all, a))),
    base.map((a) => op("fill", lit(2), a)),
    base.map((a) => op("ifError", op("sortBy", a), lit(vexList([])))),
  );
  const records = fc.array(fc.record({ n: fc.integer({ min: -2, max: 3 }), w: fc.constantFrom(0, 1, 2) }), { maxLength: 4 });

  it("P17 COMPILE.MODULE.FUSE.OUT: the modules of fuse true and of fuse false give the values of the interpreter", () => {
    fc.assert(
      fc.property(list, records, (e, rs) => {
        for (const { expected, got } of sides(e, rs)) expect(got).toStrictEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});
