import { describe, expect, expectTypeOf, it } from "vitest";
import { vex } from "./builder.ts";
import { defineDomain } from "./domain.ts";
import { evaluate } from "./evaluate.ts";
import { app, axes, each, index, lit, parent, ref } from "./ir.ts";
import { ok } from "./result.ts";
import { isSome, type Optional, type Result } from "./result.ts";
import { space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

type Box = { readonly position: Pt; readonly size: Pt; readonly name: string; readonly weight: number };
const box = (x: number, y: number, w: number, h: number, name: string, weight = 1): Box => ({
  position: new Pt(x, y),
  size: new Pt(w, h),
  name,
  weight,
});
const A = box(0, 0, 2, 2, "a", 2);
const B = box(3, 4, 1, 1, "b", 3);
const C = box(6, 8, 1, 1, "c", 5);
const D = box(0, 1, 1, 1, "d", 7);

const Num = defineDomain({
  name: "Num",
  is: (u: unknown): u is number => typeof u === "number",
  ops: {
    plus: { fn: (a: number, b: number): number => a + b, laws: ["commutative", "associative"], identity: () => 0 },
    times: { fn: (a: number, b: number): number => a * b },
    gt: { fn: (a: number, b: number): boolean => a > b },
  },
});

const cell = (alive: boolean): { readonly alive: boolean } => ({ alive });

const optionalValue = <T>(o: Optional<T>): T => {
  if (!isSome(o)) throw new Error("expected some");
  return o.value;
};

describe("the typed builder", () => {
  const pair = vex(PtDomain).over(space.record({ A, B }));
  const four = vex(PtDomain, Num).over(space.record({ A, B, C, D }));

  it("EXAMPLE.SEPARATION: the separation test, with other()", () => {
    const sep = pair.from("position")._.add("size").other()._.subtract("position")._.anyNonPositive();
    expectTypeOf(sep.at("A")).toEqualTypeOf<Optional<boolean>>();
    expect(sep.at("A")).toEqual({ tag: "some", value: true });
    expect(optionalValue(sep.all().any())).toBe(true);
    expect(sep.all().values()).toEqual([true, false]);
  });

  it("EXAMPLE.NEAREST: the minimum distance to the others (V-001, V-042)", () => {
    const minDist = four.from("position").others((e) => e._.subtract("position")._.length()).min();
    expectTypeOf(minDist.result("A")).toEqualTypeOf<Result<number>>();
    expect(value(minDist.result("A"))).toBe(1);
    expect(value(minDist.result("B"))).toBeCloseTo(Math.sqrt(18), 12);
  });

  it("EXAMPLE.OFFSETS: reduce the offsets to the others with add", () => {
    const three = vex(PtDomain).over(space.record({ A, B, C }));
    const sum = three.from("position").others((e) => e._.subtract("position")).reduce("add");
    expect(value(sum.result("A"))).toEqual(new Pt(-9, -12));
  });

  it("V-040: origin() goes back to the start after other()", () => {
    const c = pair.from("position").other().origin()._.add("size");
    expect(value(c.result("A"))).toEqual(new Pt(2, 2));
  });

  it("V-004: an unknown key gives #REF!, not a value of another record", () => {
    const loose = vex(PtDomain).over(space.record<Record<string, Box>>({ A, B }));
    expect(error(loose.from("position").to("NO_SUCH_KEY")._.add("size").result("A")).code).toBe("#REF!");
  });

  it("V-005: other() outside a pair gives #REF! at run time", () => {
    const loose = vex(PtDomain).over(space.record<Record<string, Box>>({ A, B, C }));
    expect(error(loose.from("position")._.add("size").other()._.subtract("position").result("A")).code).toBe("#REF!");
  });

  it("BUILD.IMMUTABLE: a later call does not change an earlier chain (V-010)", () => {
    const base = pair.from("position");
    const added = base._.add("size");
    expect(value(base.result("A"))).toEqual(new Pt(0, 0));
    expect(value(added.result("A"))).toEqual(new Pt(2, 2));
    expect(base.program).toEqual({ tag: "ref", path: ["position"] });
  });

  it("V-038: string and array values pass as literals, bare strings are field references", () => {
    const c = pair.from("position")._.pick(pair.lit(["x", "q"]));
    expect(value(c.result("A"))).toEqual(["x"]);
  });

  it("V-039 and V-041: the ops section does not record then, build or symbols", () => {
    const ops = pair.from("position")._ as unknown as Record<string, unknown>;
    expect(ops["then"]).toBeUndefined();
    expect(ops["toJSON"]).toBeUndefined();
    expect(typeof ops["build"]).toBe("function");
  });

  it("V-041: a chain is not a thenable, so await gives the chain itself", async () => {
    const c = pair.from("position");
    const awaited: unknown = await Promise.resolve(c);
    expect(awaited).toBe(c);
  });

  it("absolute references with of(), and lifting with a number", () => {
    expect(value(pair.from("position")._.add(pair.of("B", "size")).result("A"))).toEqual(new Pt(1, 1));
    expect(value(pair.from("position")._.add(5).result("A"))).toEqual(new Pt(5, 5));
  });

  it("multi-domain chains: the value moves from Pt to number, and Num gives the ops", () => {
    const c = four.from("position")._.length()._.times(2)._.plus("weight");
    expectTypeOf(c.result("B")).toEqualTypeOf<Result<number>>();
    expect(value(c.result("B"))).toBe(13);
  });

  it("with(): typed variables in a lexical scope", () => {
    const c = four.from("position").with({ rhs: four.of("B", "position"), k: 2 }, (chain, { rhs, k }) => chain._.subtract(rhs)._.scale(k));
    expect(value(c.result("A"))).toEqual(new Pt(-6, -8));
  });

  it("fork(): a record of branches over the same value", () => {
    const c = four.from("position").fork({ len: (b) => b._.length(), far: (b) => b._.add("size") });
    expectTypeOf(c.result("B")).toEqualTypeOf<Result<{ readonly len: number; readonly far: Pt }>>();
    expect(value(c.result("B"))).toEqual({ len: 5, far: new Pt(4, 5) });
  });

  it("ifError(): a fallback for an error value", () => {
    const loose = vex(PtDomain).over(space.record<Record<string, Partial<Box>>>({ A, X: { name: "x" } }));
    const c = loose.from("position")._.length().ifError(-1);
    expect(c.all().values()).toEqual([0, -1]);
  });

  it("the start axis: all() gives a traversal with lenient and strict reductions", () => {
    const loose = vex(PtDomain).over(space.record<Record<string, Partial<Box>>>({ A, B, X: { name: "x" } }));
    const lengths = loose.from("position")._.length().all();
    expect(optionalValue(lengths.sum())).toBe(5);
    expect(lengths.strict().sum()).toEqual({ tag: "none" });
    expect(lengths.errors()).toHaveLength(1);
    expect(lengths.map((n) => n * 2).values()).toEqual([0, 10]);
  });

  it("the program is plain data, and evaluate gives the same result", () => {
    const c = pair.from("position")._.add("size");
    expect(JSON.parse(JSON.stringify(c.program))).toEqual(c.program);
    expect(evaluate(c.program, { space: pair.space, origin: "A", domains: [PtDomain] })).toEqual(c.result("A"));
  });

  it("neighbors(): the live neighbors of a cell", () => {
    const g = vex(Num).over(space.grid([[cell(false), cell(true), cell(false)], [cell(false), cell(true), cell(false)]]));
    const live = g.start(0).neighbors(8, (n) => n.from("alive"), { where: (n) => n.from("alive") }).count();
    expect(value(live.result("0,0"))).toBe(2);
    expect(value(live.result("1,1"))).toBe(1);
    expect(value(live.result("0,2"))).toBe(2);
  });
});

describe("the types of the builder (TYPE.*)", () => {
  const pair = vex(PtDomain).over(space.record({ A, B }));
  const three = vex(PtDomain).over(space.record({ A, B, C }));

  it("TYPE.FROM: from() accepts the fields of the record and gives their type", () => {
    expectTypeOf(pair.from("position").at("A")).toEqualTypeOf<Optional<Pt>>();
    expectTypeOf(pair.from("weight").at("A")).toEqualTypeOf<Optional<number>>();
    // @ts-expect-error -- the record has no field "nope"
    pair.from("nope");
  });

  it("TYPE.OPS: ._ lists only the declared ops, with their parameter types", () => {
    expectTypeOf(pair.from("position")._).toHaveProperty("add");
    expectTypeOf(pair.from("position")._).not.toHaveProperty("toString");
    // @ts-expect-error -- "nope" is not an op of Pt
    pair.from("position")._.nope();
    // @ts-expect-error -- "name" is a string field, not a Pt field
    pair.from("position")._.add("name");
    // @ts-expect-error -- scale needs a number, and "size" is a Pt field
    pair.from("position")._.scale("size");
    // @ts-expect-error -- "C" is not a key of the space
    pair.from("position")._.add(pair.of("C", "size"));
  });

  it("TYPE.LIFT: a number argument needs liftScalar on the op", () => {
    expectTypeOf(pair.from("position")._.add(5).at("A")).toEqualTypeOf<Optional<Pt>>();
    // @ts-expect-error -- dot does not declare liftScalar
    pair.from("position")._.dot(5);
  });

  it("TYPE.STATE: after a non-domain value, ._ is gone", () => {
    expectTypeOf(pair.from("position")._.length().at("A")).toEqualTypeOf<Optional<number>>();
    // @ts-expect-error -- length() gives a number, and no domain of this chain accepts numbers
    pair.from("position")._.length()._.add("size");
  });

  it("TYPE.OTHER: other() exists only on a space with two keys", () => {
    expectTypeOf(pair.from("position").other().at("A")).toEqualTypeOf<Optional<Pt>>();
    // @ts-expect-error -- a space with three keys is not a pair
    three.from("position").other();
  });

  it("TYPE.KEYS: evaluation accepts only the keys of the space", () => {
    expectTypeOf<Parameters<typeof pair.from<"position">>[0]>().toEqualTypeOf<"position">();
    expectTypeOf<Parameters<ReturnType<typeof pair.from<"position">>["at"]>[0]>().toEqualTypeOf<"A" | "B">();
    // @ts-expect-error -- "Z" is not a key
    pair.from("position").at("Z");
  });

  it("TYPE.LIST: number reductions need a list of numbers", () => {
    expectTypeOf(three.from("position").others((e) => e._.length()).min().at("A")).toEqualTypeOf<Optional<number>>();
    // @ts-expect-error -- min needs numbers, and the body gives Pt values
    three.from("position").others((e) => e._.add("size")).min();
  });

  it("TYPE.NO-ANY: no value type is any (V-012)", () => {
    expectTypeOf(pair.from("position")._.add("size").at("A")).not.toBeAny();
    expectTypeOf(pair.from("position")._.add("size").at("A")).toEqualTypeOf<Optional<Pt>>();
  });
});

describe("the other members of the builder", () => {
  const four = vex(PtDomain, Num).over(space.record({ A, B, C, D }));
  const weights = four.start(0).each((t) => t.from("weight"));

  it("value() and explain() evaluate at a key", () => {
    const c = four.from("weight");
    expect(optionalValue(c.value("B"))).toBe(3);
    expect(c.explain("B").events.map((e) => e.label)).toEqual(["weight"]);
  });

  it("index() and offset() move the address of the later references", () => {
    expect(optionalValue(four.start(0).index(2).from("weight").at("A"))).toBe(5);
    // NAV.COMPUTED: a chain gives the position or the key, and it evaluates at the focus before the moves.
    const linked = vex(Num).over(space.record({ A: { next: "B", at: 2, n: 1 }, B: { next: "A", at: 0, n: 2 }, C: { next: "B", at: 1, n: 4 } }));
    expect(linked.start(0).to(linked.from("next")).from("n").all().values()).toEqual([2, 1, 2]);
    expect(linked.start(0).parent().index(linked.from("at")).from("n").program).toEqual(ref("n", [parent, index(ref("at"))]));
    expect(linked.start(0).index(linked.from("at")).from("n").all().values()).toEqual([4, 1, 2]);
    const row = vex(Num).over(space.array([{ n: 1 }, { n: 2 }, { n: 4 }]));
    expect(row.start(0).offset(1).from("n").all().values()).toEqual([2, 4]);
  });

  it("LOOP.NAMES FOLD.ORDER ITERATE.UNTIL: fold of a list chain and iterate of a chain", () => {
    const row = vex(Num).over(space.array([{ n: 1 }, { n: 2 }, { n: 3 }]));
    // The digits in the order of the axis: ((0 * 10 + 1) * 10 + 2) * 10 + 3.
    const digits = row.start(0).each((t) => t.from("n")).fold({ s: 0 }, (vars, n) => ({ s: vars.s._.times(10)._.plus(n) }), (vars) => vars.s);
    expect(optionalValue(digits.at("0"))).toBe(123);
    expectTypeOf(digits.at("0")).toEqualTypeOf<Optional<number>>();
    // A name without a step keeps its value. A bare field name in init reads the field at the node.
    const both = row.start(0).each((t) => t.from("n")).fold({ s: 0, k: "n" }, (vars, n) => ({ s: vars.s._.plus(n)._.plus(vars.k) }), (vars) => vars.s);
    expect(both.all().values()).toEqual([9, 12, 15]);
    const pow = row.from("n").iterate(4, { x: 1 }, (vars) => ({ x: vars.x._.times(2) }), (vars) => vars.x);
    expect(optionalValue(pow.at("0"))).toBe(16);
    const doubling = row.from("n").iterate(100, { x: "n" }, (vars) => ({ x: vars.x._.times(2) }), (vars) => vars.x, { until: (vars) => vars.x._.gt(10) });
    expect(doubling.all().values()).toEqual([16, 16, 12]);
    // The names of a loop inside a loop do not meet: each depth has its own names.
    const nested = row.from("n").iterate(2, { x: 0 }, (o) => ({ x: o.x._.plus(row.from("n").iterate(3, { x: 1 }, (i) => ({ x: i.x._.plus(1) }), (i) => i.x)) }), (o) => o.x);
    expect(optionalValue(nested.at("0"))).toBe(8);
    expect(() => row.from("n").iterate(1, { x: 0 }, () => ({ y: 1 }) as never, (vars) => vars.x)).toThrow('the name "y" of the step is not a name of init');
  });

  it("each() and the reductions of a list chain", () => {
    expect(weights.program.tag).toBe("let");
    expect(optionalValue(weights.sum().at("A"))).toBe(17);
    expect(optionalValue(weights.mean().at("A"))).toBe(4.25);
    expect(optionalValue(weights.max().at("A"))).toBe(7);
    expect(optionalValue(weights.values().at("A"))).toEqual([2, 3, 5, 7]);
    expect(optionalValue(weights.first().at("A"))).toBe(2);
    expect(optionalValue(weights.reduce("plus", { strict: true }).at("A"))).toBe(17);
    const flags = four.start(0).each((t) => t.from("position")._.anyNonPositive());
    expect(optionalValue(flags.any().at("A"))).toBe(true);
    expect(optionalValue(flags.all().at("A"))).toBe(false);
    expect(optionalValue(flags.none().at("A"))).toBe(false);
  });

  it("LIST.LENIENT: a list chain reduction is lenient by default, and strict with { strict: true }", () => {
    const loose = vex(PtDomain, Num).over(space.record<Record<string, Partial<Box>>>({ A, B, X: { name: "x" } }));
    const looseWeights = loose.start(0).each((t) => t.from("weight"));
    expect(optionalValue(looseWeights.max().at("A"))).toBe(3);
    expect(looseWeights.max({ strict: true }).at("A")).toEqual({ tag: "none" });
    expect(error(looseWeights.sum({ strict: true }).result("A")).code).toBe("#N/A");
    expect(error(looseWeights.values({ strict: true }).result("A")).code).toBe("#N/A");
    expect(optionalValue(looseWeights.count().at("A"))).toBe(2);
  });

  it("arguments: a list chain, null and a nested record are values of the program", () => {
    const r = four.start(four.rec({ list: weights, none: null, inner: four.rec({ w: "weight" }) })).result("A");
    const v = value(r) as { readonly list: unknown; readonly none: unknown; readonly inner: { readonly w: number } };
    expect(v.none).toBeNull();
    expect(v.inner.w).toBe(2);
    expect((v.list as { readonly items: readonly unknown[] }).items).toHaveLength(4);
    expect(value(four.start(null).result("A"))).toBeNull();
  });

  it("withOptions() gives the free functions and the extension handlers to the interpreter", () => {
    const root = vex(Num)
      .withOptions({ fns: { half: (n: number) => n / 2 }, extensions: { seven: () => ok(7) } })
      .over(space.record({ A }));
    expect(root.from("weight").call("half").result("A")).toEqual(ok(1));
    expect(root.start(root.ext<number>("seven")).result("A")).toEqual(ok(7));
  });
});

describe("free functions (BUILD.CALL)", () => {
  const fns = {
    half: (n: number): number => n / 2,
    label: (n: number, unit: string): string => `${n}${unit}`,
    shout: (s: string): string => s.toUpperCase(),
    plus: (a: number, b: number): number => a + b + 1000,
    boom: (_n: number): number => {
      throw new Error("boom");
    },
  };
  const root = vex(Num).withOptions({ fns }).over(space.record({ A, B }));

  it("BUILD.CALL: call applies a free function to the current value, with typed arguments and a typed result", () => {
    const half = root.from("weight").call("half");
    expectTypeOf(half.result("A")).toEqualTypeOf<Result<number>>();
    expect(half.all().values()).toEqual([1, 1.5]);
    expect(half._.times(10).all().values()).toEqual([10, 15]);
    const label = root.from("weight").call("label", "name");
    expectTypeOf(label.result("A")).toEqualTypeOf<Result<string>>();
    expect(label.all().values()).toEqual(["2a", "3b"]);
    expect(value(root.from("weight").call("label", root.lit("px")).result("B"))).toBe("3px");
    expect(value(root.from("name").call("shout").result("A"))).toBe("A");
    expect(root.from("weight").call("half").program).toEqual({ tag: "app", op: "half", args: [{ tag: "ref", path: ["weight"] }] });
  });

  it("BUILD.CALL: a free function that throws gives #CALC!, and a domain op with the same name wins", () => {
    expect(error(root.from("weight").call("boom").result("A")).code).toBe("#CALC!");
    // Num has an op "plus", so the interpreter takes it, not the free function.
    expect(value(root.from("weight").call("plus", 1).result("A"))).toBe(3);
  });

  it("TYPE.CALL: the types accept only the free functions whose first parameter accepts the current value", () => {
    const weight = root.from("weight");
    // @ts-expect-error -- there is no free function "nope"
    weight.call("nope");
    // @ts-expect-error -- "shout" takes a string, and the current value is a number
    weight.call("shout");
    // @ts-expect-error -- the second parameter of "label" is a string, not a number
    weight.call("label", 5);
    // @ts-expect-error -- a root without withOptions has no free functions
    vex(Num).over(space.record({ A })).from("weight").call("half");
    expect(weight.call("half").program.tag).toBe("app");
  });
});

describe("tree spaces in the builder (EXAMPLE.TREE)", () => {
  // ceo ─┬─ cto ─┬─ dev1
  //      │       └─ dev2
  //      └─ cfo
  const people = space.tree(
    {
      ceo: { name: "Ada", salary: 300 },
      cto: { name: "Bo", salary: 200 },
      dev1: { name: "Cy", salary: 100 },
      dev2: { name: "Di", salary: 110 },
      cfo: { name: "Ed", salary: 190 },
    },
    { cto: "ceo", cfo: "ceo", dev1: "cto", dev2: "cto" },
  );
  const org = vex(Num).over(people);

  it("EXAMPLE.TREE: the cost of each team, the depth of each person, and the name of the manager", () => {
    const team = org.from("salary")._.plus(org.start(0).descendants((d) => d.from("salary")).sum());
    expect(team.all().values()).toEqual([900, 410, 100, 110, 190]);
    const depth = org.start(0).ancestors((a) => a).count();
    expect(depth.all().values()).toEqual([0, 1, 2, 2, 1]);
    const manager = org.start(0).parent().from("name");
    expect(manager.all().values()).toEqual(["Ada", "Bo", "Bo", "Ada"]);
    expect(error(manager.result("ceo")).code).toBe("#REF!");
    expect(optionalValue(org.start(0).siblings((s) => s.from("salary")).sum().at("dev1"))).toBe(110);
    expect(optionalValue(org.start(0).children((c) => c.from("name")).values().at("ceo"))).toEqual(["Bo", "Ed"]);
  });

  it("AXIS.TREE: a tree axis with where, and a tree axis in a space that is not a tree", () => {
    const rich = org.start(0).descendants((d) => d.from("name"), { where: (d) => d.from("salary")._.gt(150) }).values();
    expect(optionalValue(rich.at("ceo"))).toEqual(["Bo", "Ed"]);
    const flat = vex(Num).over(space.record({ A, B }));
    expect(error(flat.start(0).children((c) => c.from("weight")).count().result("A"))).toMatchObject({ code: "#REF!", kind: "no-tree" });
  });

  it("AXIS.WINDOW: window(from, to, body) gives the targets at the offsets, and keys() gives their keys", () => {
    const rows = vex(Num).over(space.array([{ weight: 1 }, { weight: 2 }, { weight: 4 }]));
    const prev = rows.start(0).window(-1, 0, (c) => c.from("weight"));
    expect(JSON.stringify(prev.program)).toContain(JSON.stringify(each(axes.window(-1, 0), ref("weight"))));
    expect(optionalValue(prev.keys().at("1"))).toEqual(["0", "1"]);
    expect(optionalValue(prev.values().at("0"))).toEqual([1]);
    expect(optionalValue(rows.start(0).window(-1, 1, (c) => c.from("weight"), { where: (c) => c.from("weight")._.gt(1) }).values().at("1"))).toEqual([2, 4]);
  });

  it("AXIS.REVERSE: the option reverse of an axis gives its targets from the last to the first, also with a test", () => {
    const rows = vex(Num).over(space.array([{ weight: 1 }, { weight: 2 }, { weight: 4 }]));
    const back = rows.start(0).each((c) => c.from("weight"), { reverse: true });
    expect(back.program).toMatchObject({ tag: "let", body: { tag: "each", axis: { t: "reverse", axis: { t: "all" } } } });
    expect(optionalValue(back.values().at("0"))).toEqual([4, 2, 1]);
    expect(optionalValue(rows.start(0).window(-1, 1, (c) => c.from("weight"), { reverse: true, where: (c) => c.from("weight")._.gt(1) }).values().at("1"))).toEqual([4, 2]);
  });

  it("AXIS.GRAPH: successors, predecessors and reachable follow the edges of a graph", () => {
    const g = vex(Num).over(space.graph({ A: { weight: 1 }, B: { weight: 2 }, C: { weight: 4 } }, { A: ["B"], B: ["C"], C: ["A"] }));
    expect(optionalValue(g.start(0).successors((c) => c.from("weight")).values().at("A"))).toEqual([2]);
    expect(optionalValue(g.start(0).predecessors((c) => c.from("weight")).values().at("A"))).toEqual([4]);
    expect(optionalValue(g.start(0).reachable((c) => c.from("weight")).values().at("A"))).toEqual([2, 4]);
  });

  it("AXIS.TABLE: table(name, body) reads the keys of another table of the evaluation", () => {
    const rows = vex(Num).over(space.array([{ weight: 1 }]));
    const others = rows.start(0).table("other", (c) => c.from("weight"));
    expect(JSON.stringify(others.program)).toContain(JSON.stringify(each(axes.table("other"), ref("weight"))));
    // Without the table in the evaluation, the axis gives #REF!.
    expect(error(others.values().result("0")).code).toBe("#REF!");
  });

  it("BUILD.LIST.KEYS: keys() gives the keys of the items with a value, and errors() gives the errors of the failed items", () => {
    // The grandparent of cto and cfo does not exist, so their items fail with #REF!.
    const grand = org.start(0).descendants((d) => d.parent().parent().from("name"));
    expectTypeOf(grand.keys().at("ceo")).toEqualTypeOf<Optional<readonly ("ceo" | "cto" | "dev1" | "dev2" | "cfo")[]>>();
    expect(optionalValue(grand.keys().at("ceo"))).toEqual(["dev1", "dev2"]);
    expect(optionalValue(grand.values().at("ceo"))).toEqual(["Ada", "Ada"]);
    const errs = grand.errors().result("ceo");
    expect(errs.ok ? errs.value.map((e) => e.code) : null).toEqual(["#REF!", "#REF!"]);
    // With { strict: true }, the first failed item is the result of keys().
    expect(error(grand.keys({ strict: true }).result("ceo")).code).toBe("#REF!");
    expect(optionalValue(org.start(0).children((c) => c.from("name")).errors().at("dev1"))).toEqual([]);
  });

  it("BUILD.IF FORM.IF: if() gives the selected branch of a boolean chain, and evaluates only that branch", () => {
    const pay = org.from("salary")._.gt(150).if(org.from("name"), org.lit("junior"));
    expect(pay.all().values()).toEqual(["Ada", "Bo", "junior", "junior", "Ed"]);
    // The branch that the condition does not select does not evaluate, so its error does not matter.
    const safe = org.from("salary")._.gt(0).if(1, org.start(0).parent().from("name"));
    expect(optionalValue(safe.at("ceo"))).toBe(1);
    // The types offer if() only on a boolean chain. At run time, a condition that is not a boolean gives #VALUE!.
    // @ts-expect-error -- the value of the chain is a text, not a boolean
    expect(error(org.from("name").if(1, 2).result("ceo")).code).toBe("#VALUE!");
  });

  it("BUILD.LIST.READ: a list chain gives its list, an Optional of it and its trace at an origin", () => {
    const team = org.start(0).children((c) => c.from("salary"));
    const r = team.result("cto");
    expect(r.ok && r.value.items.map((i) => [i.key, i.result.ok ? i.result.value : null])).toEqual([["dev1", 100], ["dev2", 110]]);
    const none = team.at("dev1");
    expect(none.tag === "some" && none.value.items).toEqual([]);
    expect(team.explain("cto").events.at(-1)?.label).toBe("let $0");
    // In a space that is not a tree, the list is an error value.
    expect(error(vex(Num).over(space.record({ A, B })).start(0).children((c) => c.from("weight")).result("A")).kind).toBe("no-tree");
  });

  it("BUILD.AXIS.ADDRESS V-043: the moves before an axis are its address, so parent().children() gives the children of the parent", () => {
    // V-043: the builder dropped the moves before an axis. parent().children() gave the children of the origin.
    const team = org.start(0).parent().children((c) => c.from("name")).values();
    expect(optionalValue(team.at("dev1"))).toEqual(["Cy", "Di"]);
    expect(optionalValue(team.at("cto"))).toEqual(["Bo", "Ed"]);
    expect(error(team.result("ceo")).code).toBe("#REF!");
    // Inside the axis the focus is the target, and the origin stays: each teammate compares with the origin.
    const richer = org.start(0).parent().children((c) => c.from("salary")._.gt(c.origin().from("salary"))).values();
    expect(optionalValue(richer.at("dev1"))).toEqual([false, true]);
    // An address with two moves, and an address with an absolute key.
    expect(optionalValue(org.start(0).parent().parent().children((c) => c.from("name")).values().at("dev2"))).toEqual(["Bo", "Ed"]);
    expect(optionalValue(org.start(0).to("cfo").siblings((s) => s.from("name")).values().at("dev1"))).toEqual(["Bo"]);
    // The others axis leaves out the key of the address, not the origin.
    const rows = vex(Num).over(space.array([{ v: 1 }, { v: 2 }, { v: 4 }]));
    expect(optionalValue(rows.start(0).offset(-1).others((o) => o.from("v")).sum().at("1"))).toBe(6);
    expect(error(rows.start(0).offset(-1).others((o) => o.from("v")).sum().result("0")).code).toBe("#REF!");
  });
});

describe("functions and lists in the builder (BUILD.FN, BUILD.LIST.ORDER, BUILD.LIST.BUILD)", () => {
  const rows = vex(Num).over(space.array([{ w: 3, n: 30 }, { w: 1, n: 10 }, { w: 2, n: 20 }]));

  it("BUILD.FN: root.fn makes a function with typed parameters, functions binds it, and call gives a typed chain", () => {
    const scaled = rows.fn(["number"], (x) => x._.times(rows.start(0).from("w")));
    const plus = rows.fn(["number", "number"], (a, b) => a._.plus(b));
    const e = rows.from("n").functions({ scaled, plus }, (c, call) => call.plus(call.scaled(c), 1));
    expectTypeOf(e.result("0")).toEqualTypeOf<Result<number>>();
    // The body of scaled reads w at the focus of the call: here the origin.
    expect(e.all().values()).toEqual([91, 11, 41]);
    // Inside an axis, the body reads w at each target.
    const total = rows.start(0).functions({ scaled }, (c, call) => c.each((t) => call.scaled(t.from("n"))).sum());
    expect(total.all().values()).toEqual([140, 140, 140]);
    // A function of an outer functions is in the scope of an inner one (FN.TOTAL).
    const twice = rows.from("n").functions({ scaled }, (c, outer) => c.functions({ again: rows.fn(["number"], (x) => outer.scaled(outer.scaled(x))) }, (d, inner) => inner.again(d)));
    expect(twice.all().values()).toEqual([270, 10, 80]);
    // A value that is not a function of root.fn gives a TypeError.
    expect(() => rows.from("n").functions({ f: ((x: unknown) => x) as never }, (c) => c)).toThrow('the function "f" is not a function of root.fn');
    // The names of the builder stay unique: in an axis, the start value keeps its value in a function, in the body of
    // functions, in a call and in each of a list. The same program without functions gives the same values.
    // Each value differs from the start value c, so a name that hid c would give another result.
    const withFns = rows.from("n").each((c) =>
      c._.times(3).functions({ twice: rows.fn(["number"], (x) => x._.times(2)), inFn: rows.fn(["number"], (x) => x.others((o) => o._.plus(c)).sum()) }, (d, call) =>
        call
          .inFn(d._.times(5))
          ._.plus(d.others((o) => o._.plus(c)).sum())
          ._.plus(call.twice(d).others((o) => o._.plus(c)).sum())
          ._.plus(c.each((t) => t.from("w")).sortBy().each((t) => t.others((o) => o.from("n")._.plus(c)).sum()).sum()),
      ),
    );
    const inline = rows.from("n").each((c) =>
      c._.times(15)
        .others((o) => o._.plus(c))
        .sum()
        ._.plus(c._.times(3).others((o) => o._.plus(c)).sum())
        ._.plus(c._.times(6).others((o) => o._.plus(c)).sum())
        ._.plus(c.each((t) => t.from("w")).sortBy().each((t) => t.others((o) => o.from("n")._.plus(c)).sum()).sum()),
    );
    for (const k of rows.space.keys) expect(withFns.values().result(k)).toEqual(inline.values().result(k));
    // In each of a list, the start value c keeps its value: each item adds the others and two times c, 120 + 6c in all.
    const keep = rows.from("n").each((c) => c.each((t) => t.from("w")).sortBy().each((t) => t.others((o) => o.from("n")._.plus(c)).sum()).sum());
    expect(optionalValue(keep.values().at("0"))).toEqual([300, 300, 300]);
    const program = e.program;
    expect(program.tag).toBe("let");
    expect(Object.values((program as { bind: Readonly<Record<string, { tag: string }>> }).bind).map((x) => x.tag)).toEqual(["fn", "fn"]);
  });

  it("BUILD.LIST.ORDER: sortBy, take and nth on a list chain, and each over the items of a list", () => {
    const byW = rows.start(0).each((c) => c.from("w")).sortBy();
    expect(optionalValue(byW.keys().at("0"))).toEqual(["1", "2", "0"]);
    expect(optionalValue(byW.take(2).keys().at("0"))).toEqual(["1", "2"]);
    expectTypeOf(byW.nth(1).result("0")).toEqualTypeOf<Result<number>>();
    expect(optionalValue(byW.nth(1).at("0"))).toBe(2);
    // each goes over the items in the order of the list, also from its end and with a test.
    expect(optionalValue(byW.each((t) => t.from("n")).values().at("0"))).toEqual([10, 20, 30]);
    expect(optionalValue(byW.each((t) => t.from("n"), { reverse: true, where: (t) => t.from("w")._.gt(1) }).values().at("0"))).toEqual([30, 20]);
    // fold goes over the list of each, and it needs the list of an axis.
    expect(optionalValue(byW.each((t) => t.from("n")).fold({ s: 0 }, (vars, item) => ({ s: vars.s._.plus(item) }), (vars) => vars.s).at("0"))).toBe(60);
    expect(() => byW.fold({ s: 0 }, (vars) => ({ s: vars.s }), (vars) => vars.s)).toThrow("fold needs the list of an axis");
    // The fold of an axis keeps the let of the start value: here the body adds the start value.
    expect(optionalValue(rows.from("w").each((c) => c._.plus("n")).fold({ s: 0 }, (vars, item) => ({ s: vars.s._.plus(item) }), (vars) => vars.s).at("1"))).toBe(63);
    expect(error(byW.take(2, { strict: true }).nth(5).result("0")).code).toBe("#N/A");
  });

  it("BUILD.LIST.BUILD: drop, append, without and flat on a list chain, and an axis body that gives a list chain", () => {
    const byW = rows.start(0).each((c) => c.from("w")).sortBy();
    const ns = rows.start(0).each((c) => c.from("n"));
    expect(optionalValue(byW.drop(1).keys().at("0"))).toEqual(["2", "0"]);
    expect(byW.drop(1, { strict: true }).program).toEqual(app("drop", byW.program, lit(1), lit({ strict: true })));
    const both = byW.append(ns);
    expect(optionalValue(both.values().at("0"))).toEqual([1, 2, 3, 30, 10, 20]);
    expect(optionalValue(both.keys().at("0"))).toEqual(["1", "2", "0", "0", "1", "2"]);
    expectTypeOf(both.values().result("0")).toEqualTypeOf<Result<readonly number[]>>();
    // The items of two lists of two types have both types.
    const texts = rows.start(0).each(() => rows.start("a"));
    expectTypeOf(byW.append(texts).nth(0).result("0")).toEqualTypeOf<Result<number | "a">>();
    expect(optionalValue(ns.without(byW.take(2)).keys().at("0"))).toEqual(["0"]);
    expectTypeOf(ns.without(texts).values().result("0")).toEqualTypeOf<Result<readonly number[]>>();
    // A body that gives a list chain makes a list of lists: here the n of the target and of the next key.
    const pairs = rows.start(0).each((c) => c.window(0, 1, (t) => t.from("n")));
    expectTypeOf(pairs.flat().values().result("0")).toEqualTypeOf<Result<readonly number[]>>();
    expect(optionalValue(pairs.flat().values().at("0"))).toEqual([30, 10, 10, 20, 20]);
    expect(optionalValue(byW.each((t) => t.window(0, 1, (u) => u.from("w"))).flat().count().at("0"))).toBe(5);
    // @ts-expect-error -- flat needs a list chain whose items are lists
    ns.flat();
    // An argument that is not a chain makes the builder throw.
    // @ts-expect-error -- a number is not a list chain
    expect(() => ns.append(5)).toThrow("append needs a list chain");
    // @ts-expect-error -- a field name is not a list chain
    expect(() => ns.without("w")).toThrow("without needs a list chain");
  });
});
