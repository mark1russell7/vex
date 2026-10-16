/**
 * The golden files of the generated source (docs/COMPILER.md §10). A change of the generated code shows as a readable
 * diff in review. To accept a change, run `vitest run -u` and commit the new files.
 */
import { app, axes, each, ext, fold, index, iterate, key, let_, lit, offset, rec, ref, space, v, vex, type CompileOptions, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain, Vec2, Vec2Domain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { generate } from "./tiers.ts";

// The programs of the speed lane (packages/core/bench/programs.ts). Their IR does not depend on the domain.
const NEAREST = vex(Vec2Domain)
  .over(space.record({ A: { position: new Vec2(0, 0) } }))
  .from("position")
  .others((e) => e._.subtract("position")._.length())
  .min().program;
const LIFE = vex(Vec2Domain)
  .over(space.grid([[{ alive: true }]]))
  .start(0)
  .neighbors(8, (c) => c.from("alive"), { where: (c) => c.from("alive") })
  .count().program;

const sourceOf = (e: Expr, options?: CompileOptions): string => {
  const g = generate(e, options);
  return g.ok ? g.source : `no source: ${g.reason}\n`;
};

const expectGolden = async (name: string, e: Expr, options?: CompileOptions): Promise<void> => {
  await expect(sourceOf(e, options)).toMatchFileSnapshot(`./__golden__/${name}.js`);
};

describe("COMPILE.SOURCE: the generated source", () => {
  it("EXAMPLE.NEAREST: the minimum over the others is one loop", async () => {
    await expectGolden("nearest", NEAREST);
  });

  it("the live neighbors of a cell: a count over an axis with a test", async () => {
    await expectGolden("life", LIFE);
  });

  it("the forms: if, and, or, ifError, a binding and a record", async () => {
    // A binding with statements gets a flag, and a binding without statements does not.
    const e = let_(
      { a: ref("missing"), c: lit(1), d: rec({ x: lit(2) }) },
      rec({
        x: app("if", app("and", ref("b"), app("or", ref("c"), lit(true))), ref("n"), lit(0)),
        y: app("ifError", v("a"), app("add", ref("n", [key("B")]), lit(1))),
        z: app("add", v("c"), v("free")),
        w: v("d"),
      }),
    );
    await expectGolden("forms", e);
  });

  it("a list op skips an error item, and strict stops at it", async () => {
    const e = rec({
      sum: app("sum", each(axes.where(axes.table("T"), ref("on")), ref("n")), lit({ strict: true })),
      keys: app("keys", each(axes.others, ref("n"))),
      reduce: app("reduce", each(axes.children, ref("p")), lit("add")),
      none: app("none", each(axes.all, ref("b"))),
      mean: app("mean", each(axes.window(-1, 1), ref("n"))),
      // An empty address is the focus.
      empty: app("count", { tag: "each", axis: { t: "all" }, body: { tag: "ref", path: ["n"], at: [] }, at: [] }),
      // The strict count inside an item skips that item of the outer count.
      nested: app("count", each(axes.all, app("count", each(axes.all, ref("s")), lit({ strict: true })))),
      from: app("count", each(axes.others, ref("n"), [key("B")])),
    });
    await expectGolden("lists", e);
  });

  it("LOOP.NAMES: the loops fold and iterate, with until, a where test, an address and a step of an unknown kind", async () => {
    const e = rec({
      // A name without a step keeps its value. The step of "a" reads a field, so its kind needs a check.
      iterate: iterate(5, { a: lit(0), b: lit(1) }, { a: app("add", ref("n"), v("b")) }, app("add", v("a"), v("b"))),
      until: iterate(10, { a: lit(1) }, { a: app("multiply", v("a"), lit(2)) }, v("a"), app("gt", v("a"), ref("n"))),
      fold: fold(axes.where(axes.all, app("gt", ref("n"), lit(0))), { sum: lit(0), text: lit("") }, { sum: app("add", v("sum"), ref("n")), text: app("concat", v("text"), ref("s")) }, rec({ sum: v("sum"), text: v("text") }), [index(ref("i"))]),
      computed: ref("n", [key(ref("k")), offset(1)]),
    });
    await expectGolden("loops", e, { domains: [NumDomain, TextDomain, BoolDomain] });
  });

  it("a list and an extension stop the program at an error", async () => {
    await expectGolden("stops", rec({ list: each(axes.all, ref("n")), errors: app("errors", each(axes.all, ref("n"))), ext: ext("note", "a") }));
  });

  it("the fast path of each kind of op site, for the options", async () => {
    const options: CompileOptions = { domains: [Vec2Domain, NumDomain, BoolDomain], fns: { twice: (x: unknown) => x } };
    const e = rec({
      // A method that lifts a number, a method without arguments, a function of a domain, and a free function.
      method: app("subtract", ref("p"), lit(1)),
      length: app("length", ref("p")),
      fn: app("pow", ref("n"), lit(2)),
      free: app("twice", ref("n")),
      // A list op name and an unknown name use the dispatch of the runtime.
      list: app("max", ref("n"), lit(1)),
      unknown: app("nope", ref("n")),
      neighbors: app("count", each(axes.neighbors(4), ref("n"))),
    });
    await expectGolden("sites", e, options);
    // A group: the largest width in the column of the origin, with the column as the key of the memo.
    const column = app("mod", ref("i", [{ t: "origin" }]), v("cols"));
    await expectGolden("group", app("max", each(axes.where(axes.all, app("eq", app("mod", ref("i"), v("cols")), column)), ref("w"))), options);
    await expectGolden("nearest-vec2", NEAREST, options);
  });

  it("the same expression gives the same source", () => {
    expect(sourceOf(NEAREST)).toBe(sourceOf(NEAREST));
  });

  it("no name and no literal of the expression goes into the source as text", () => {
    const hostile = '"); throw new Error("injected"); ("';
    const e = let_(
      { [hostile]: lit(hostile) },
      rec({ [hostile]: app(hostile, v(hostile), ref([hostile]), ext(hostile, hostile)), n: app("sum", each(axes.table(hostile), ref("n")), lit(hostile)) }),
    );
    const source = sourceOf(e);
    expect(source).not.toContain("injected");
    expect(source).not.toContain(hostile);
  });
});
