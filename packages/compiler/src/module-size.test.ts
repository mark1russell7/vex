/**
 * The smaller form of a module (COMPILE.MODULE.SIZE). Each rule has a program that shows it and a program where it must
 * not fire. Each program gives the values of the interpreter (P17). The functions of the last pass also have tests on
 * lines of code, because these tests can reach each case of a rule.
 */
import { app, axes, call, defineDomain, each, evaluate, fn, fold, isVexList, let_, lit, rec, ref, space, v, vexList, type AnyDomain, type Expr } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NODE_SCHEMA, NODE_SHAPE, SHAPE_DOMAINS } from "../../pilots/src/ireko-shapes.ts";
import { propertyTimeout } from "../../testkit/src/fc-timeout.ts";
import { emitModule, emitSheetModule, type Emitted, type ModuleOptions } from "./module.ts";
import { aliases, deadConstants, deadKeys, inlineOps, liveDecls, onceCells, tidy } from "./module-tidy.ts";

interface Span {
  readonly lo: number;
  readonly hi: number;
}

/** A domain with ops that have no inline form of the printer. */
const SpanDomain = defineDomain({
  name: "Span",
  is: (u: unknown): u is Span => typeof u === "object" && u !== null && typeof (u as Partial<Span>).lo === "number" && typeof (u as Partial<Span>).hi === "number",
  ops: {
    size: { fn: (i: Span): number => i.hi - i.lo, returns: "number" },
    twice: { fn: (i: Span): number => i.hi - i.lo + (i.hi - i.lo), returns: "number" },
    fails: { fn: (i: Span): number => (i.hi > 1 ? Number.NaN : i.lo), returns: "number" },
    grown: { fn: (i: Span, d: number): Span => ({ lo: i.lo - d, hi: i.hi + d }), params: ["number"], returns: "domain" },
  },
  samples: (): readonly Span[] => [{ lo: 0, hi: 1 }, { lo: -2, hi: 5 }],
}) as AnyDomain;

const SCHEMA = { fields: { n: "number", w: "number", b: "boolean", xs: { list: "number" } }, vars: { t: "boolean" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const SPANS: ModuleOptions = { domains: [NumDomain, SpanDomain], schema: { fields: { iv: "domain:Span", n: "number" } } };

/** This function gives the text of the run of a source, with no helper. */
const runOf = (source: string): string => source.slice(source.indexOf("export function run"));

type Run = (records: unknown, vars: unknown) => readonly unknown[];
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives the source of a module, and fails the test for a program that cannot be a module. */
function sourceOf(m: Emitted): string {
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  return value;
}

/** This function gives a list of the input. An item with the value `undefined` is an error item. */
const input = (...values: (number | undefined)[]): object => ({
  kind: "vex.list",
  items: values.map((x, i) => (x === undefined ? { key: String(i), result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } } : { key: String(i), result: { ok: true, value: x } })),
});

const RECORDS = [
  { n: 3, w: 1, b: true, xs: input(3, 0, 2) },
  { n: -1, w: 0, b: false, xs: input(5, undefined, -1) },
  { n: 0, w: 2, b: true, xs: input() },
  { n: 2, w: -1, b: false, xs: input(undefined) },
];
const SPAN_RECORDS = [
  { iv: { lo: 0, hi: 1 }, n: 3 },
  { iv: { lo: 2, hi: 5 }, n: -1 },
];
const VARS = { t: true };

/** This function compares the module of a program with the interpreter at each key, with fuse true and fuse false (P17). */
function expectSame(e: Expr, options: ModuleOptions = OPTIONS, records: readonly unknown[] = RECORDS): string {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: options.domains ?? [] }));
  const small = sourceOf(emitModule(e, options));
  for (const source of [small, sourceOf(emitModule(e, { ...options, fuse: false }))]) {
    const m = make(source);
    expect(m.run(structuredClone(records), VARS)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
  }
  return small;
}

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const w = ref("w");
const one = op("fill", lit(1), n);
const EMPTY = lit(vexList([]));
/** A `fill` with no items and a value that cannot fail. */
const NOTHING = op("fill", lit(0), op("add", lit(1), lit(2)));
/** A `fill` with no items and a value that fails at each key. */
const FAILS = op("fill", lit(0), op("divide", lit(1), lit(0)));
/** A `fill` with no items and a value that fails at the key with `w` 0. */
const FAILS_AT_KEY = op("fill", lit(0), op("divide", n, w));
const y = v("y");
/** A `flat` over a list, where each item gives `yes` or `no`. The fused loop prints this `if` as a statement. */
const branches = (yes: Expr, no: Expr, ...rest: Expr[]): Expr => op("flat", each(axes.list(ref("xs")), op("if", op("gt", y, lit(0)), yes, no), undefined, ["y"]), ...rest);
/** One item for each positive item of the list, or the items of `other`. */
const orElse = (other: Expr): Expr => branches(op("fill", lit(1), y), other);

describe("COMPILE.MODULE.SIZE.FILL: a fill with no items", () => {
  it("COMPILE.MODULE.SIZE.FILL: a value that cannot fail prints the empty array, with no FI", () => {
    for (const e of [op("count", NOTHING), op("count", op("fill", lit(0), n)), op("sum", op("append", NOTHING, each(axes.all, n)))]) expect(expectSame(e)).not.toContain("FI(");
    const looped = fold(axes.all, { xs: NOTHING }, { xs: op("append", v("xs"), one) }, op("count", v("xs")));
    expect(expectSame(looped)).toMatch(/let l\d+ = \[\];/);
  });

  it("COMPILE.MODULE.SIZE.FILL: a value that can fail keeps FI and its error", () => {
    for (const e of [op("count", FAILS), op("count", FAILS_AT_KEY), op("ifError", op("count", FAILS), lit(-1)), op("append", FAILS, NOTHING)]) expect(expectSame(e)).toContain("FI(0, ");
    // A count that is not the literal 0 keeps FI, with the error of a count that is not valid.
    for (const e of [op("count", op("fill", n, lit(1))), op("count", op("fill", lit(-1), lit(1))), op("count", op("fill", lit(2), lit(1)))]) expect(expectSame(e)).toContain("FI(");
    // A second option is not a form of this rule.
    expect(emitModule(op("count", op("fill", lit(0), lit(1), lit(2))), OPTIONS).ok).toBe(emitModule(op("count", op("fill", lit(0), lit(1), lit(2))), { ...OPTIONS, fuse: false }).ok);
  });

  it("COMPILE.MODULE.SIZE.FILL: fuse false keeps the text of FI, and a refusal of the value stays", () => {
    expect(sourceOf(emitModule(op("count", NOTHING), { ...OPTIONS, fuse: false }))).toContain("FI(0, ");
    expect(sourceOf(emitModule(op("count", op("fill", lit(0), n)), { ...OPTIONS, fuse: false }))).toContain("FI(0, ");
    const refused = op("count", op("fill", lit(0), op("nope", lit(1))));
    expect(emitModule(refused, OPTIONS)).toStrictEqual(emitModule(refused, { ...OPTIONS, fuse: false }));
  });

  it("COMPILE.MODULE.SIZE.FILL COMPILE.MODULE.FUSE.OUT: the empty list of a constant of the run is one frozen list", () => {
    const m = make(expectSame(NOTHING));
    const [first, second] = m.run(structuredClone(RECORDS), VARS);
    expect(first).toBe(second);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("COMPILE.MODULE.SIZE.FILL: a branch that appends a list with no items prints nothing, and it reads no constant", () => {
    const source = runOf(expectSame(orElse(NOTHING)));
    expect(source).not.toContain("else");
    expect(source).not.toContain("FI(0");
    expect(source).not.toMatch(/const c\d+ = /);
    expect(runOf(expectSame(orElse(op("fill", lit(0), y))))).not.toContain("else");
  });

  it("COMPILE.MODULE.SIZE.FILL: a branch with a value that can fail keeps its read of the list", () => {
    for (const e of [orElse(FAILS), orElse(op("fill", lit(0), op("divide", lit(1), y))), branches(op("fill", lit(1), y), FAILS, lit({ strict: true }))]) {
      const source = runOf(expectSame(e));
      expect(source).toContain("FI(0, ");
      expect(source).toContain("else");
    }
  });
});

describe("COMPILE.MODULE.SIZE.KEY: a key that no code reads", () => {
  it("COMPILE.MODULE.SIZE.KEY: a loop over a list that reads no key has no key", () => {
    const list = op("append", each(axes.all, n), one);
    expect(expectSame(op("sum", each(axes.list(ref("xs")), lit(1))))).not.toMatch(/const j\d+ = /);
    expect(expectSame(fold(axes.list(list), { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, v("s")))).not.toMatch(/const j\d+ = A/);
  });

  it("COMPILE.MODULE.SIZE.KEY: a loop that reads the key keeps it", () => {
    expect(expectSame(op("sum", each(axes.all, n)))).toMatch(/R\[j\d+\]\["n"\]/);
    expect(expectSame(op("sum", each(axes.list(each(axes.all, n)), n)))).toMatch(/const j\d+ = /);
  });

  it("COMPILE.MODULE.SIZE.KEY: the pass reads the head of the loop", () => {
    const loop = ["for (let q1 = 0; q1 < A2.length; q1++) {", "  const j3 = A2[q1][0];", "  use(1);", "}", "use(j3);"];
    expect(deadKeys(loop)).toStrictEqual([loop[0], loop[2], loop[3], loop[4]]);
    const down = ["for (let q1 = A2.length - 1; q1 >= 0; q1--) {", "  const j3 = A2[q1];", "}"];
    expect(deadKeys(down)).toStrictEqual([down[0], down[2]]);
    const read = ["for (let q1 = 0; q1 < A2.length; q1++) {", "  const j3 = A2[q1][0];", "  use(j3);", "}"];
    expect(deadKeys(read)).toStrictEqual(read);
    // The first line of another loop, and a read of a pair with no loop over its array, can throw.
    for (const other of [["for (let q9 = 0; q9 < A2.length; q9++) {", "  const j3 = A2[q1][0];", "}"], ["if (x) {", "  const j3 = A2[q1];", "}"], ["for (let q1 = 0; q1 < B2.length; q1++) {", "  const j3 = A2[q1][0];", "}"], ["for (let q1 = 0; q1 < xA2.length; q1++) {", "  const j3 = A2[q1][0];", "}"], ["for (let q1 = 0; q1 < x.A2.length; q1++) {", "  const j3 = A2[q1][0];", "}"], ["  const j3 = A2[q1];"]]) expect(deadKeys(other)).toStrictEqual(other);
    // A read of a position alone reads an array at a position, so it needs only the head of its loop.
    const range = ["for (let q1 = lo; q1 < hi; q1++) {", "  const j3 = A2[q1];", "}"];
    expect(deadKeys(range)).toStrictEqual([range[0], range[2]]);
  });
});

describe("COMPILE.MODULE.SIZE.ALIAS: a second name of a value", () => {
  it("COMPILE.MODULE.SIZE.ALIAS: a module reads the first name", () => {
    expect(expectSame(op("sum", each(axes.window(-1, 1), n)))).not.toMatch(/const f\d+ = o;/);
    const chain = op("append", one, op("flat", each(axes.all, one)));
    expect(expectSame(chain)).not.toMatch(/const o\d+ = o\d+;/);
  });

  it("V-073 COMPILE.MODULE.SIZE.ALIAS: a block that declares the alias again keeps both aliases", () => {
    const lines = ["for (let o = 0; o < n; o++) {", "  const f1 = o;", "  const a2 = H[f1];", "  if (a2) {", "    const f1 = o;", "    x(H[f1]);", "  }", "}"];
    expect(aliases(lines)).toStrictEqual(lines);
  });

  it("COMPILE.MODULE.SIZE.ALIAS: a name that the block writes keeps its alias", () => {
    const reader = fold(axes.all, { xs: EMPTY }, { xs: fold(axes.list(v("xs")), { a: one }, { a: v("a") }, v("a")) }, op("count", v("xs")));
    expect(expectSame(reader)).toMatch(/const A\d+ = l\d+;/);
  });

  it("COMPILE.MODULE.SIZE.ALIAS: the pass renames each read, and no text, property or key", () => {
    const lines = ["const t2 = o1;", 'use(t2, "t2", t2.t2, { t2: t2 }, ...t2, 1e2, f(a, { x: 1, t2: 2 }));', "}", "after(1);"];
    expect(aliases(lines.map((x) => `  ${x}`).slice(0, 2).concat(["}"]))).toStrictEqual(['  use(o1, "t2", o1.t2, { t2: o1 }, ...o1, 1e2, f(a, { x: 1, t2: 2 }));', "}"]);
    expect(aliases(["  const f1 = o;", "  use(f1);"])).toStrictEqual(["  use(o);"]);
    expect(aliases(["  const a1 = b2;", "  const c3 = a1;", "  use(c3);"])).toStrictEqual(["  use(b2);"]);
    expect(aliases(["  const a1 = b2;", '  use("a text with \\" and a1", `a1`, \'a1\');'])).toStrictEqual(['  use("a text with \\" and a1", `a1`, \'a1\');']);
    // A literal and a name without digits are not this form.
    for (const other of [["  const a1 = true;", "  use(a1);"], ["  const a1 = n;", "  use(a1);"], ["  const a = b1;", "  use(a);"], ["  let a1 = b2;", "  use(a1);"]]) expect(aliases(other)).toStrictEqual(other);
  });

  it("COMPILE.MODULE.SIZE.ALIAS: a write stops the rule when it can change the value of a read", () => {
    const refused: readonly (readonly string[])[] = [
      // A write in the block, in each form.
      ["  let b1 = 0;", "  const a2 = b1;", "  b1 = 1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  b1++;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  ++b1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  --b1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  b1 += 1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  b1 >>>= 1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  b1 ??= 1;", "  use(a2);"],
      ["  let b1 = 0;", "  const a2 = b1;", "  for (;;) {", "    b1 = 1;", "  }", "  use(a2);"],
      // A function can read the alias after a write of the name.
      ["  let b1 = 0;", "  {", "    const a2 = b1;", "    keep(() => a2);", "  }", "  b1 = 1;"],
      ["  let b1 = 0;", "  {", "    const a2 = b1;", "    keep(function () { return a2; });", "  }", "  b1 = 1;"],
      // A write in a function can start in a call in the block.
      ["  let b1 = 0;", "  const f3 = () => {", "    b1 = 1;", "  };", "  {", "    const a2 = b1;", "    f3();", "    use(a2);", "  }"],
      ["  let b1 = 0;", "  const f3 = () => (b1 = 1);", "  {", "    const a2 = b1;", "    f3();", "    use(a2);", "  }"],
      ["  let b1 = 0;", "  function f3() {", "    b1 = 1;", "  }", "  {", "    const a2 = b1;", "    f3();", "    use(a2);", "  }"],
      // A name that this function does not declare.
      ["  const f3 = () => {", "    const a2 = b1;", "    use(a2);", "  };", "  b1 = 1;"],
      ["  {", "    const a2 = b1;", "    use(a2);", "  }", "  b1 = 1;"],
      // A declaration of the name in the block hides the name.
      ["  const a2 = b1;", "  {", "    const b1 = 2;", "    use(a2);", "  }"],
      ["  const a2 = b1;", "  {", "    let x, b1 = 2;", "    use(a2);", "  }"],
      ["  const a2 = b1;", "  keep((b1) => a2);"],
      ["  const a2 = b1;", "  keep((x, b1) => a2);"],
      ["  const a2 = b1;", "  keep(b1 => a2);"],
      ["  const a2 = b1;", "  keep(function (x, b1) { return a2; });"],
      ["  const a2 = b1;", "  const [x, b1] = y;", "  use(a2);"],
      // A read out of the block, as in two copies of a text.
      ["  {", "    const a2 = b1;", "  }", "  use(a2);"],
      ["  {", "    const a2 = b1;", "  }", "  {", "    const a2 = c3;", "    use(a2);", "  }", "  use(a2);"],
    ];
    for (const lines of refused) expect(aliases(lines)).toStrictEqual(lines);
    // A write before the block, in the same function, does not change a read in the block.
    expect(aliases(["  let b1 = 0;", "  b1 = 1;", "  {", "    const a2 = b1;", "    use(a2);", "  }", "  b1 = 2;"])).toStrictEqual(["  let b1 = 0;", "  b1 = 1;", "  {", "    use(b1);", "  }", "  b1 = 2;"]);
    // Each write in the arrow of the alias, also for a name of that arrow.
    expect(aliases(["  const f3 = () => {", "    let b1 = 0;", "    b1 = 1;", "    {", "      const a2 = b1;", "      use(a2);", "    }", "  };"])).toStrictEqual(["  const f3 = () => {", "    let b1 = 0;", "    b1 = 1;", "    {", "      use(b1);", "    }", "  };"]);
    // A comparison and an arrow are not writes.
    expect(aliases(["  const a2 = b1;", "  use(a2 === b1, b1 == 2, b1 <= 3, b1 >= 3, b1 != 1, b1 !== 2, keep((x) => a2));"])).toStrictEqual(["  use(b1 === b1, b1 == 2, b1 <= 3, b1 >= 3, b1 != 1, b1 !== 2, keep((x) => b1));"]);
    // A property with the name of a variable is not a write of the variable.
    expect(aliases(["  const a2 = b1;", "  x.b1 = 1;", "  keep(() => a2);"])).toStrictEqual(["  x.b1 = 1;", "  keep(() => b1);"]);
    expect(aliases(["  const a2 = b1;", "  const b1x = 1;", "  use(a2);"])).toStrictEqual(["  const b1x = 1;", "  use(b1);"]);
  });
});

/** The lines of a lazy cell with one `return`. */
const cell = (name: string, value: string): readonly string[] => [`  const ${name} = L(() => {`, `    return ${value};`, "  });"];

describe("COMPILE.MODULE.SIZE.ONCE: a lazy cell with one read", () => {
  it("COMPILE.MODULE.SIZE.ONCE: the module of NODE_SHAPE prints a cell at its read, and the cell of each key stays", () => {
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const source = sourceOf(emitModule(NODE_SHAPE, node));
    expect(source).toMatch(/\.push\(\[0, G\(fn\d+\(c\d+\)\)\]\);/);
    expect(source).toMatch(/out\[o\] = G\(c\d+\(\)\);/);
  });

  it("COMPILE.MODULE.SIZE.ONCE P17: a program with a cell gives the value of the interpreter", () => {
    const total = fn(["x"], op("sum", each(axes.all, op("add", n, v("x")))));
    const e = let_({ total }, op("add", op("sum", op("append", op("fill", lit(1), call("total", lit(1))), op("fill", lit(1), call("total", lit(2))))), n));
    expect(expectSame(e)).toContain("out[o] = ");
  });

  it("COMPILE.MODULE.SIZE.ONCE: the pass prints the cell at a read in another cell, in a try and in a branch", () => {
    const inner = [...cell("c1", "f(x)"), "  const c2 = L(() => {", "    try {", "      if (t) {", "        use(G(c1()));", "      } else {", "        use(2);", "      }", "    } catch {", "      use(3);", "    }", "  });"];
    expect(onceCells(inner)).toStrictEqual(["  const c2 = L(() => {", "    try {", "      if (t) {", "        use(G(f(x)));", "      } else {", "        use(2);", "      }", "    } catch {", "      use(3);", "    }", "  });"]);
    const otherBranches = (open: string): readonly string[] => [...cell("c1", "f(x)"), "  const c2 = L(() => {", `    ${open}`, "      use(G(c1()));", "    }", "  });"];
    expect(onceCells(otherBranches("if (t) {"))[2]).toBe("      use(G(f(x)));");
    expect(onceCells(otherBranches("} else {"))[2]).toBe("      use(G(f(x)));");
    expect(onceCells(otherBranches("} else if (t) {"))[2]).toBe("      use(G(f(x)));");
    expect(onceCells(otherBranches("} catch {"))[2]).toBe("      use(G(f(x)));");
    expect(onceCells(otherBranches("try {"))[2]).toBe("      use(G(f(x)));");
    // A read at the top of the run runs once.
    expect(onceCells([...cell("c1", "f(x)"), "  try {", "    use(G(c1()));", "  } catch {", "  }"])).toStrictEqual(["  try {", "    use(G(f(x)));", "  } catch {", "  }"]);
    // A cell that reads a cell: the rule starts again after each change. A value with the text of a pattern stays.
    expect(onceCells([...cell("c1", "f('$&')"), ...cell("c2", "G(c1()) + 1"), "  use(G(c2()));"])).toStrictEqual(["  use(G(G(f('$&')) + 1));"]);
  });

  it("COMPILE.MODULE.SIZE.ONCE: the cell stays when the read does not run once, or it is not the form G(c())", () => {
    const refused: readonly (readonly string[])[] = [
      // Two reads.
      [...cell("c1", "f(x)"), "  use(G(c1()));", "  use(G(c1()));"],
      // A read of the cell that holds the sentinel.
      [...cell("c1", "f(x)"), "  use(c1());"],
      // A read in a loop, in a function, in the head of a loop and in a line with an arrow.
      [...cell("c1", "f(x)"), "  for (const o of K) {", "    use(G(c1()));", "  }"],
      [...cell("c1", "f(x)"), "  while (t) {", "    use(G(c1()));", "  }"],
      [...cell("c1", "f(x)"), "  const c2 = Q((j) => {", "    use(G(c1()));", "  });"],
      [...cell("c1", "f(x)"), "  const f2 = () => {", "    use(G(c1()));", "  };"],
      [...cell("c1", "f(x)"), "  for (let q = 0; q < G(c1()); q++) use(q);"],
      [...cell("c1", "f(x)"), "  while (G(c1())) use(1);"],
      [...cell("c1", "f(x)"), "  do use(G(c1())); while (t);"],
      [...cell("c1", "f(x)"), "  keep(() => G(c1()));"],
      // A read in a word that holds the name of G, and a read after a property.
      [...cell("c1", "f(x)"), "  use(BG(c1()));"],
      [...cell("c1", "f(x)"), "  use(a.G(c1()));"],
      // A cell with statements, and a cell in a block.
      ["  const c1 = L(() => {", "    const x = 1;", "    return x;", "  });", "  use(G(c1()));"],
      ["  {", "    const c1 = L(() => {", "      return 1;", "    });", "    use(G(c1()));", "  }"],
    ];
    for (const lines of refused) expect(onceCells(lines)).toStrictEqual(lines);
  });
});

describe("COMPILE.MODULE.SIZE.DEAD: code that no code reads", () => {
  it("COMPILE.MODULE.SIZE.DEAD: a module has no helper, op or constant that no code reads", () => {
    const source = expectSame(op("count", op("fill", lit(0), op("add", op("abs", lit(1)), lit(2)))));
    for (const word of ["function FI", "function T(", "function V("]) expect(source).not.toContain(word);
    expect(sourceOf(emitModule(op("count", NOTHING), { ...OPTIONS, fuse: false }))).toContain("function FI");
  });

  it("COMPILE.MODULE.SIZE.DEAD: a name of the run keeps the refusal of each name of the printer", () => {
    for (const e of [op("count", NOTHING), op("count", op("fill", lit(0), n)), orElse(NOTHING)]) {
      const refused = emitModule(e, { ...OPTIONS, name: "FI" });
      expect(refused.ok).toBe(false);
      expect(refused).toStrictEqual(emitModule(e, { ...OPTIONS, name: "FI", fuse: false }));
    }
  });

  it("COMPILE.MODULE.SIZE.DEAD: the pass removes a constant in each form, also through a chain of reads", () => {
    const t = "  const c1 = T(() => f());";
    expect(deadConstants([t, "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants(["  const c1 = [];", "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants([...cell("c1", "1"), "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants(["  const c1 = L(() => {", "    const x = 1;", "    return x;", "  });", "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants(["  let c1;", "  try {", "    c1 = 1;", "  } catch {", "    c1 = E;", "  }", "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants([t, "  const c2 = T(() => G(c1));", "  use(1);"])).toStrictEqual(["  use(1);"]);
  });

  it("COMPILE.MODULE.SIZE.DEAD: the pass removes a column and its pack at each depth, also through a chain of reads", () => {
    const column = ["    const col1 = Q((j1) => {", "      const f = (k) => {", "        return k;", "      };", "      return f(R[o1]);", "    });"];
    expect(deadConstants(["  const fn2 = (p1) => {", ...column, "    return 0;", "  };"])).toStrictEqual(["  const fn2 = (p1) => {", "    return 0;", "  };"]);
    expect(deadConstants(["  let PK1;", "  use(1);"])).toStrictEqual(["  use(1);"]);
    expect(deadConstants(["  let PK1;", "  const col1 = Q((j) => {", "    return PK1 || 1;", "  });", "  const col2 = Q((j) => {", "    return col1(j);", "  });", "  use(1);"])).toStrictEqual(["  use(1);"]);
  });

  it("COMPILE.MODULE.SIZE.DEAD: the pass keeps a column or a pack that a line reads", () => {
    const kept: readonly (readonly string[])[] = [
      ["  const col1 = Q((j) => {", "    return j;", "  });", "  use(col1(0));"],
      ["  let PK1;", "  use(PK1);"],
      // The pack of a column that a line reads.
      ["  let PK1;", "  const col1 = Q((j) => {", "    return PK1;", "  });", "  use(col1(0));"],
    ];
    for (const lines of kept) expect(deadConstants(lines)).toStrictEqual(lines);
  });

  it("COMPILE.MODULE.SIZE.DEAD: the pass keeps a constant that a line reads, and each other statement", () => {
    const kept: readonly (readonly string[])[] = [
      ["  const c1 = T(() => f());", "  use(c1);"],
      ["  const c1 = [];", "  use(c1);"],
      [...cell("c1", "1"), "  use(c1());"],
      ["  let c1;", "  try {", "    c1 = 1;", "  } catch {", "    c1 = E;", "  }", "  use(c1);"],
      // A name without digits, a block and a form that can throw.
      ["  const c = T(() => f());"],
      ["    const c1 = T(() => f());"],
      ["  const c1 = f();"],
      ["  let c1;", "  use(2);"],
      ["  let c;", "  try {", "  } catch {", "  }"],
    ];
    for (const lines of kept) expect(deadConstants(lines)).toStrictEqual(lines);
  });

  it("COMPILE.MODULE.SIZE.DEAD: a declaration stays when the roots read it, also through another declaration", () => {
    const decls = new Map([["A", "const A = B;"], ["B", "const B = 1;"], ["C", "const C = D;"], ["D", "const D = C;"]]);
    expect([...liveDecls(decls, "use(A)").keys()]).toStrictEqual(["A", "B"]);
    expect([...liveDecls(decls, "use(C)").keys()]).toStrictEqual(["C", "D"]);
    expect([...liveDecls(decls, "use()").keys()]).toStrictEqual([]);
  });
});

/** This function gives the result of `inlineOps` for one declaration of `op_1`, one line and the other text `kept`. */
function inlined(decl: string, line: string, kept = ""): { readonly left: boolean; readonly line: string } {
  const { decls, lines } = inlineOps({ decls: new Map([["op_1", decl]]), lines: [line], kept, globals: new Set(["Math", "Number", "undefined"]) });
  return { left: decls.has("op_1"), line: lines.join(" ") };
}

/** This function compares a program with the interpreter, and gives its text in the form that a build prints. */
function inlineText(e: Expr): string {
  expectSame(e, SPANS, SPAN_RECORDS);
  return sourceOf(emitModule(e, { ...SPANS, faults: "value" }));
}

describe("COMPILE.MODULE.SIZE.INLINE: an op with one call", () => {
  it("COMPILE.MODULE.SIZE.INLINE: a call with names prints the body of the op, and each other call keeps the op", () => {
    const named = let_({ s: ref("iv") }, op("size", v("s")));
    const source = inlineText(named);
    expect(source).not.toContain("op_");
    expect(source).toMatch(/\(\w+\.hi-\w+\.lo\)|\(\w+\.hi - \w+\.lo\)/);
    // A second read of a parameter reads the name.
    expect(inlineText(let_({ s: ref("iv") }, op("twice", v("s"))))).not.toContain("op_");
    // Two calls keep the op, and so does a call with an argument that is not a name.
    expect(inlineText(let_({ s: ref("iv") }, op("add", op("size", v("s")), op("size", op("grown", v("s"), lit(1))))))).toContain("op_");
    expect(inlineText(op("size", op("grown", ref("iv"), n)))).toContain("op_");
    // An op that fails keeps its check, with the error of the interpreter.
    expect(inlineText(let_({ s: ref("iv") }, op("ifError", op("fails", v("s")), lit(7))))).toContain("k_number");
  });

  it("COMPILE.MODULE.SIZE.INLINE: the pass writes a call as the body, with each parameter as its argument", () => {
    expect(inlined("const op_1 = (a,b)=>a+b*a;", "  use(op_1(y1, y2));")).toStrictEqual({ left: false, line: "  use((y1+y2*y1));" });
    expect(inlined("const op_1 = a=>a.a;", "  use(op_1(y1));")).toStrictEqual({ left: false, line: "  use((y1.a));" });
    expect(inlined("const op_1 = (a, b) => ({ from: a, b, a: 1, c: [a, b], d: b });", "  use(op_1(y1, y2));").line).toBe("  use((({ from: y1, b:y2, a: 1, c: [y1, y2], d: y2 })));");
    expect(inlined('const op_1 = a=>a === "a";', "  use(op_1(y1));").line).toBe('  use((y1 === "a"));');
    expect(inlined("const op_1 = a=>a === 'a';", "  use(op_1(y1));").line).toBe("  use((y1 === 'a'));");
    expect(inlined("const op_1 = a=>Math.max(a, 1)/a/2;", "  use(op_1(y1));").line).toBe("  use((Math.max(y1, 1)/y1/2));");
    expect(inlined("const op_1 = a=>typeof a===\"number\"?true:null;", "  use(op_1(y1));").line).toBe('  use((typeof y1==="number"?true:null));');
    expect(inlined("const op_1 = a=>({ a });", "  use(op_1(y1));").line).toBe("  use((({ a:y1 })));");
    expect(inlined("const op_1 = a=>[1.5e3, .5, a[0]/2];", "  use(op_1(y1));").line).toBe("  use(([1.5e3, .5, y1[0]/2]));");
    expect(inlined("const op_1 = a=>({ Math, x: void a, y: NaN, z: Infinity, u: false });", "  use(op_1(y1));").line).toBe("  use((({ Math, x: void y1, y: NaN, z: Infinity, u: false })));");
    expect(inlined("const op_1 = a=>(\n  a\n);", "  use(op_1(y1));").line).toBe("  use((( y1 )));");
    // The check of a domain holds the body of its one check.
    const { decls } = inlineOps({ decls: new Map([["v_1", "const v_1 = b=>b.x>0;"], ["k_d", "const k_d = (x) => (v_1(x) ? x : F());"]]), lines: [], kept: "", globals: new Set() });
    expect([...decls]).toStrictEqual([["k_d", "const k_d = (x) => ((x.x>0) ? x : F());"]]);
    // A call in a text is not a call.
    expect(inlined("const op_1 = a=>a;", '  use("op_1(y1)", op_1(y2));', "")).toStrictEqual({ left: true, line: '  use("op_1(y1)", op_1(y2));' });
  });

  it("COMPILE.MODULE.SIZE.INLINE: a call stays when the op has a second read, or its arguments are not names", () => {
    const op1 = "const op_1 = a=>a+1;";
    expect(inlined(op1, "  use(op_1(y1), op_1(y2));").left).toBe(true);
    expect(inlined(op1, "  use(op_1(y1));", "use(op_1)").left).toBe(true);
    expect(inlined(op1, "  use(op_1(y1 + 1));").left).toBe(true);
    expect(inlined(op1, "  use(op_1(f(y1)));").left).toBe(true);
    expect(inlined(op1, "  use(op_1(1));").left).toBe(true);
    expect(inlined(op1, "  use(op_1());").left).toBe(true);
    expect(inlined(op1, "  use(op_1(y1, y2));").left).toBe(true);
    expect(inlined(op1, "  use(xop_1(y1));").left).toBe(true);
    expect(inlined(op1, "  use(a.op_1(y1));").left).toBe(true);
    expect(inlined(op1, "  use(1);").left).toBe(true);
  });

  it("COMPILE.MODULE.SIZE.INLINE: a body that a site cannot hold keeps its function", () => {
    const refused = [
      "const op_1 = ()=>1;",
      "const op_1 = (a=1)=>a;",
      "const op_1 = (...a)=>a;",
      "const op_1 = ({a})=>a;",
      "const op_1 = function (a) { return a; };",
      "const op_1 = async a=>a;",
      "const op_1 = a=>{ return a; };",
      "const op_1 = a=>{};",
      "const op_1 = a=>b=>a;",
      "const op_1 = a=>a=1;",
      "const op_1 = a=>a+=1;",
      "const op_1 = a=>a++;",
      "const op_1 = a=>--a;",
      "const op_1 = a=>`${a}`;",
      "const op_1 = a=>/a/.test(a);",
      "const op_1 = a=>typeof /a/;",
      "const op_1 = a=>a // a\n;",
      "const op_1 = a=>outer(a);",
      "const op_1 = a=>this.x;",
      "const op_1 = a=>arguments[0];",
      "const op_1 = a=>new Foo(a);",
      "const op_1 = a=>a in b;",
      "const op_1 = a=>({ f(x) { return x; } });",
      "const op_1 = a=>({ get x() { return a; } });",
      "const op_1 = a=>({ other });",
      "const op_1 = a=>'a\nb';",
      "const op_1 = a=>a;\nconst op_2 = 1, x = 2",
    ];
    for (const decl of refused) expect([decl, inlined(decl, "  use(op_1(y1));").left]).toStrictEqual([decl, true]);
  });
});

describe("COMPILE.MODULE.SIZE.FLAT: list helpers with no depth", () => {
  const nested = { fields: { xs: { list: "number" }, ys: { list: { list: "number" } } } } as const;

  it("COMPILE.MODULE.SIZE.FLAT: a module with depth 0 prints no depth, also with plain lists", () => {
    const e = op("sum", ref("xs"));
    const source = expectSame(e);
    expect(source).toContain("function LI(x, t) {");
    expect(source).toMatch(/LI\(r\["xs"\], \w+\)/);
    expect(source).not.toContain("h - 1");
    const plain = sourceOf(emitModule(e, { ...OPTIONS, lists: "plain" }));
    expect(plain).toContain("function LA(x, t) {");
    expect(plain).toMatch(/LA\(r\["xs"\], \w+\)/);
    expect(plain).not.toContain("h - 1");
    const m = make(plain);
    expect(m.run([{ n: 1, w: 1, b: true, xs: [1, 2] }], VARS)).toStrictEqual([3]);
    expect(() => m.run([{ n: 1, w: 1, b: true, xs: ["a"] }], VARS)).toThrow("does not keep the schema");
  });

  it("COMPILE.MODULE.SIZE.FLAT: a module with another depth and fuse false keep the depth", () => {
    const e = op("sum", ref("xs"));
    const deep = sourceOf(emitModule(e, { domains: [NumDomain], schema: nested }));
    expect(deep).toContain("function LI(x, h, t) {");
    expect(deep).toMatch(/LI\(r\["xs"\], 0, \w+\)/);
    expect(deep).toMatch(/LI\(r\["ys"\], 1, \w+\)/);
    const deepPlain = sourceOf(emitModule(e, { domains: [NumDomain], schema: nested, lists: "plain" }));
    expect(deepPlain).toContain("function LA(x, h, t) {");
    expect(sourceOf(emitModule(e, { ...OPTIONS, fuse: false }))).toContain("function LI(x, h, t) {");
    const list = { kind: "vex.list", items: [{ key: "0", result: { ok: true, value: input(1) } }] };
    expect(make(deep).run([{ xs: input(4), ys: list }], {})).toStrictEqual([4]);
    expect(() => make(deep).run([{ xs: input(4), ys: input(1) }], {})).toThrow("does not keep the schema");
  });
});

describe("COMPILE.MODULE.SIZE: the pass and P17", { timeout: propertyTimeout(60_000) }, () => {
  it("COMPILE.MODULE.SIZE: the pass keeps a module with no such code", () => {
    const parts = { decls: new Map([["F", "function F() { throw E; }"]]), lines: ["  const out = F();", "  return out;"], kept: "export function run() {", globals: new Set<string>() };
    expect(tidy(parts)).toStrictEqual({ decls: parts.decls, lines: parts.lines });
  });

  it("COMPILE.MODULE.SIZE: the option fuse decides the pass, also in a sheet", () => {
    const columns = new Map<string, Expr>([["A", op("count", NOTHING)]]);
    const sheet = { domains: [NumDomain], schema: { fields: { n: "number" } }, kinds: { A: "number" } } as const;
    expect(sourceOf(emitSheetModule(columns, sheet))).not.toContain("FI(");
    expect(sourceOf(emitSheetModule(columns, { ...sheet, fuse: false }))).toContain("FI(");
  });

  const lists = fc.constantFrom<Expr>(NOTHING, FAILS, FAILS_AT_KEY, EMPTY, one, op("fill", lit(0), n), op("fill", lit(2), n), each(axes.all, n), each(axes.window(-1, 1), op("divide", n, w)), ref("xs"));
  const branch = fc.tuple(lists, lists).map(([a, b]) => op("if", ref("b"), a, b));
  const others = fc.constantFrom<Expr>(NOTHING, FAILS, EMPTY, op("fill", lit(0), y), op("fill", lit(0), op("divide", lit(1), y)));
  const part = fc.oneof(lists, branch, fc.tuple(others, fc.boolean()).map(([no, s]) => branches(op("fill", lit(1), y), no, ...(s ? [lit({ strict: true })] : []))), fc.tuple(lists, lists).map(([a, b]) => op("append", a, b)), fc.tuple(branch, fc.boolean()).map(([b, s]) => op("flat", each(axes.all, b), ...(s ? [lit({ strict: true })] : []))));
  const chain = fc.tuple(part, part).map(([a, b]) => op("append", a, b));
  const uses: fc.Arbitrary<(l: Expr) => Expr> = fc.constantFrom(
    (l: Expr) => l,
    (l: Expr) => op("count", l),
    (l: Expr) => op("ifError", op("sum", l), lit(-1)),
    (l: Expr) => let_({ ys: l }, op("add", op("count", v("ys")), op("count", op("append", one, v("ys"))))),
    (l: Expr) => fold(axes.all, { ys: l }, { ys: op("append", v("ys"), one) }, op("count", v("ys"))),
    (l: Expr) => fold(axes.list(l), { s: lit(0) }, { s: op("add", v("s"), lit(1)) }, v("s")),
    (l: Expr) => fold(axes.all, { ys: EMPTY, s: lit(0) }, { ys: fold(axes.list(v("ys")), { a: l }, { a: v("a") }, v("a")), s: op("count", v("ys")) }, v("s")),
    (l: Expr) => rec({ s: lit("o1"), c: op("count", l) }),
  );

  it("COMPILE.MODULE.SIZE P17: a random program with these forms gives the value of the interpreter at each key", () => {
    fc.assert(
      fc.property(fc.oneof(part, chain), uses, (l, use) => {
        const e = use(l);
        const small = emitModule(e, OPTIONS);
        expect(small.ok).toBe(emitModule(e, { ...OPTIONS, fuse: false }).ok);
        fc.pre(small.ok);
        expectSame(e);
      }),
    );
  });
});
