/** One object at each place of a program: the printer and the lowering hold facts of a place by the object of its node. */
import { app, axes, type AnyDomain, each, ext, fold, iterate, let_, lit, MAX_NESTING, rec, ref, v, vexList, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { emitModule, emitSheetModule, listFactsOf, type ModuleOptions } from "./module.ts";
import { originalOf, placesRead, unshared, unsharedAll } from "./unshared.ts";

const DOMAINS: readonly AnyDomain[] = [NumDomain, BoolDomain, TextDomain];
const OPTIONS: ModuleOptions = { domains: DOMAINS, schema: { fields: { n: "number" } } };
const add = (a: Expr, b: Expr): Expr => app("add", a, b);

/** This function gives the nodes of a part of a program, one for each place. */
function placesIn(x: unknown): readonly Expr[] {
  if (Array.isArray(x)) return x.flatMap(placesIn);
  if (typeof x !== "object" || x === null) return [];
  const tag = (x as { tag?: unknown }).tag;
  const parts = tag === "lit" || tag === "ext" ? [] : Object.values(x).flatMap(placesIn);
  return typeof tag === "string" ? [x as Expr, ...parts] : parts;
}

describe("V-080 UNSHARED: each place of a program has its own object", () => {
  it("V-080: a program without a shared object stays the same objects", () => {
    const e = add(ref("n"), let_({ a: lit(1) }, v("a")));
    expect(unshared(e)).toBe(e);
    const exprs = [e, lit(2)];
    expect(unsharedAll(exprs)).toBe(exprs);
    expect(originalOf(e)).toBe(e);
  });

  it("V-080: a copy keeps a field with the name __proto__ as an own field, with a copy of its value", () => {
    const field = lit(1);
    const named = rec(JSON.parse('{"__proto__":{"tag":"lit","value":1},"m":{"tag":"lit","value":2}}') as Readonly<Record<string, Expr>>);
    const copy = unshared(rec({ a: named, b: named, c: field, d: field })) as Extract<Expr, { tag: "rec" }>;
    const first = copy.fields["a"] as Extract<Expr, { tag: "rec" }>;
    expect(first).not.toBe(named);
    expect(Object.getOwnPropertyDescriptor(first.fields, "__proto__")?.value).toStrictEqual(lit(1));
    expect(Object.getPrototypeOf(first.fields)).toBe(Object.prototype);
    expect(Object.keys(first.fields)).toStrictEqual(["__proto__", "m"]);
    expect(copy.fields["c"]).toStrictEqual(field);
    expect(copy.fields["c"]).not.toBe(copy.fields["d"]);
    expect(originalOf(copy.fields["c"])).toBe(field);
  });

  it("V-080: a program with no shared object needs one walk", () => {
    let walked = 0;
    const seen = (e: Expr): Expr =>
      new Proxy(e, {
        get(target, name, receiver): unknown {
          if (name === "tag") walked++;
          return Reflect.get(target, name, receiver) as unknown;
        },
      });
    const exprs = [seen(add(seen(ref("n")), seen(lit(1))))];
    const read = placesRead(exprs);
    const once = walked;
    expect(read).toEqual({ error: undefined, shares: false });
    expect(once).toBeGreaterThan(0);
    expect(unsharedAll(exprs, read.shares)).toBe(exprs);
    expect(walked).toBe(once);
  });

  it("V-080: one walk finds a shared object", () => {
    const x = ref("n");
    expect(placesRead([add(x, x)])).toEqual({ error: undefined, shares: true });
    expect(placesRead([x, x]).shares).toBe(true);
    const shared = add(x, x);
    expect(unsharedAll([shared], true)[0]).not.toBe(shared);
  });

  it("V-080: a program from JSON has no shared objects", () => {
    const shared = v("a");
    const e = add(shared, let_({ a: lit(7) }, shared));
    const read = JSON.parse(JSON.stringify(e)) as Expr;
    expect(unshared(read)).toBe(read);
    expect(read).toStrictEqual(e);
  });

  it("V-080: a shared object has a copy at each place, with the same structure", () => {
    const shared = v("a");
    const e = add(shared, let_({ a: lit(7) }, shared));
    const plain = unshared(e);
    expect(plain).not.toBe(e);
    expect(plain).toStrictEqual(e);
    expect(new Set(placesIn(plain)).size).toBe(placesIn(plain).length);
    expect(placesIn(plain).map(originalOf)).toStrictEqual(placesIn(e));
    expect(originalOf(plain)).toBe(e);
  });

  it("V-080: a copy holds each form, and a value of a literal and the data of an extension stay the same objects", () => {
    const shared = add(ref("n"), lit(1));
    const value = vexList([]);
    const data = { column: "c", at: [] };
    const forms = rec({
      a: each(axes.where(axes.list(lit(value)), shared), shared, [{ t: "key", key: shared }], ["x"]),
      b: fold(axes.all, { s: shared }, { s: add(v("s"), shared) }, v("s")),
      c: iterate({ axis: axes.list(lit(value)) }, { s: shared }, { s: shared }, shared, shared),
      d: ext("cell", data),
    });
    const plain = unshared(forms);
    expect(plain).toStrictEqual(forms);
    expect(new Set(placesIn(plain)).size).toBe(placesIn(plain).length);
    expect(placesIn(plain).filter((x) => x.tag === "lit" && x.value === value)).toHaveLength(2);
    expect(placesIn(plain).filter((x) => x.tag === "ext" && x.data === data)).toHaveLength(1);
  });

  it("V-080: two expressions of a sheet that share an object get a copy each", () => {
    const shared = v("a");
    const [one, two] = unsharedAll([shared, shared]);
    expect(one).not.toBe(two);
    expect(one).toStrictEqual(shared);
    expect(two).toStrictEqual(shared);
  });

  it("V-080: an expression nested too deep stays the same objects", () => {
    const shared = lit(1);
    let e: Expr = add(shared, shared);
    for (let i = 0; i <= MAX_NESTING; i++) e = app("abs", e);
    expect(unshared(e)).toBe(e);
  });

  it("V-080: the facts of a list node with two places are the facts of the original", () => {
    const inverse = each(axes.window(-1, 1), app("divide", lit(1), ref("n")));
    const { emitted, facts } = listFactsOf(() => emitModule(app("count", app("append", inverse, inverse)), OPTIONS));
    expect(emitted.ok).toBe(true);
    expect(facts.get(inverse)).toStrictEqual({ clean: false, inner: [], fresh: false, reads: 1 });
  });

  it("V-080: the formulas of a sheet with one object give each place its meaning", () => {
    const shared = v("a");
    const columns = new Map<string, Expr>([
      ["p", let_({ a: lit(1) }, shared)],
      ["q", let_({ a: lit(2) }, add(shared, lit(1)))],
    ]);
    const m = emitSheetModule(columns, { domains: DOMAINS, schema: { fields: { n: "number" } }, kinds: { p: "number", q: "number" } });
    if (!m.ok) throw new Error(m.reason);
    // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from emitSheetModule, as in a build.
    const { run } = new Function(`${m.source.replaceAll(/^export /gm, "")}
return { run };`)() as { run: (records: unknown, vars: unknown) => unknown };
    expect(run([{ n: 0 }], {})).toStrictEqual({ p: [1], q: [3] });
  });
});
