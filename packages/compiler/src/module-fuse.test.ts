/**
 * The first steps of the fusion of list ops in standalone modules (docs/COMPILER.md §7.6, COMPILE-FUSE). The option
 * `fuse` prints the code with and without fusion (COMPILE.MODULE.FUSE.OFF). The printer keeps the facts `clean` and
 * `fresh` of each list, and the count of the reads of each list node (COMPILE.MODULE.FUSE.FACTS). With `fuse`, an op
 * over a clean list has no scan for error items (COMPILE.MODULE.FUSE.CLEAN).
 */
import { createHash } from "node:crypto";
import * as fc from "fast-check";
import { app, axes, call, cell, each, evaluate, fn, fold, isVexList, iterate, let_, lit, offset, rec, ref, SheetRun, space, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
import { BoolDomain, NumDomain, TextDomain } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { NODE_SCHEMA, NODE_SHAPE, SHAPE_COLUMNS, SHAPE_DOMAINS, SHAPE_KINDS, SHAPE_SCHEMA } from "../../pilots/src/ireko-shapes.ts";
import { emitModule, emitSheetModule, listFactsOf, type Emitted, type ListFacts, type ModuleOptions, type SheetModuleOptions } from "./module.ts";

const SCHEMA = { fields: { n: "number", w: "number", b: "boolean", xs: { list: "number" } }, vars: { t: "boolean" } } as const;
const OPTIONS: ModuleOptions = { domains: [NumDomain, BoolDomain, TextDomain], schema: SCHEMA };
const SHEET: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", n: "number" } }, kinds: { shape: { list: "number", texts: true } } };

const op = (name: string, ...args: Expr[]): Expr => app(name, ...args);
const n = ref("n");
const item = (key: string, value: unknown): ListItem => ({ key, result: { ok: true, value } });
const errorItem = (key: string): ListItem => ({ key, result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } });
/**
 * A list that can hold error items: the inverse of `w` at each record of a window. The list of a window depends on the
 * key, so it is not a constant of the run.
 */
const inv = each(axes.window(-1, 1), op("divide", lit(1), ref("w")));
/** A list of one number at each key. Its value depends on the key, so it is not a constant of the run. */
const one = op("fill", lit(1), n);

/** This function gives the source of a module, and fails the test for a program that cannot be a module. */
function sourceOf(m: Emitted): string {
  if (!m.ok) throw new Error(m.reason);
  return m.source;
}

/** This function gives the facts of each list node of a program, and checks that the facts do not change the code. */
function factsOf(e: Expr, options: ModuleOptions = OPTIONS): ReadonlyMap<Expr, ListFacts> {
  const { emitted, facts } = listFactsOf(() => emitModule(e, options));
  expect(sourceOf(emitted)).toBe(sourceOf(emitModule(e, options)));
  return facts;
}

/** This function gives the facts of one list node, and fails the test for a node without facts. */
function factOf(facts: ReadonlyMap<Expr, ListFacts>, node: Expr): ListFacts {
  const f = facts.get(node);
  if (f === undefined) throw new Error("the node has no facts of a list");
  return f;
}

/** This function gives the facts of a node of a program, with the facts `clean`, `fresh` and `reads` only. */
const short = (e: Expr, node: Expr, options: ModuleOptions = OPTIONS): Pick<ListFacts, "clean" | "fresh" | "reads"> => {
  const { clean, fresh, reads } = factOf(factsOf(e, options), node);
  return { clean, fresh, reads };
};

/** This function gives the first 16 digits of the hash of a source. */
const hash = (source: string): string => createHash("sha256").update(source).digest("hex").slice(0, 16);

/** This function gives the count of the reads of the list of the name `ys` in a body. */
const reads = (body: Expr): number => short(let_({ ys: one }, body), one).reads;

/** This function tells if each read of the name `acc` of a program is clean. */
const accClean = (e: Expr): boolean => [...factsOf(e).entries()].filter(([x]) => x.tag === "var" && x.name === "acc").every(([, f]) => f.clean);

describe("COMPILE.MODULE.FUSE.OFF: the option fuse", () => {
  const programs: readonly Expr[] = [
    op("count", op("append", inv, one)),
    op("sum", op("flat", each(axes.all, op("fill", lit(2), n)))),
    let_({ ys: op("sortBy", inv) }, op("add", op("count", v("ys")), op("sum", v("ys")))),
    iterate(3, { acc: one }, { acc: op("append", v("acc"), one) }, op("count", v("acc"))),
    op("take", inv, lit(2)),
  ];

  it("COMPILE.MODULE.FUSE.OFF: the default is fuse true, and fuse false prints the module of the version before fusion", () => {
    for (const e of programs) expect(sourceOf(emitModule(e, { ...OPTIONS, fuse: true }))).toBe(sourceOf(emitModule(e, OPTIONS)));
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const shapes: SheetModuleOptions = { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf" };
    expect(sourceOf(emitModule(NODE_SHAPE, { ...node, fuse: true }))).toBe(sourceOf(emitModule(NODE_SHAPE, node)));
    expect(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, fuse: true }))).toBe(sourceOf(emitSheetModule(SHAPE_COLUMNS, shapes)));
    // The hashes of the shapes of ireko in version 0.10 of the compiler, before step 3 of COMPILE-FUSE.
    expect(hash(sourceOf(emitModule(NODE_SHAPE, { ...node, fuse: false })))).toBe("58810f602515705f");
    expect(hash(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, fuse: false })))).toBe("91a25086213c18bd");
    // The clean form changes the text of both modules.
    expect(sourceOf(emitModule(NODE_SHAPE, node))).not.toBe(sourceOf(emitModule(NODE_SHAPE, { ...node, fuse: false })));
    expect(sourceOf(emitSheetModule(SHAPE_COLUMNS, shapes))).not.toBe(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, fuse: false })));
  });

  it("COMPILE.MODULE.FUSE.OFF: a value of fuse that is not a boolean gives a reason", () => {
    const bad = { ...OPTIONS, fuse: "yes" as unknown as boolean };
    expect(emitModule(one, bad)).toStrictEqual({ ok: false, reason: 'the option "fuse" is yes, not true or false' });
    expect(emitSheetModule(new Map([["c", lit(1)]]), { ...SHEET, fuse: 0 as unknown as boolean })).toStrictEqual({ ok: false, reason: 'the option "fuse" is 0, not true or false' });
  });

  it("COMPILE.MODULE.FUSE.OFF COMPILE.MODULE.FUSE.FACTS: the notes of the facts do not change the code of the shapes of ireko", () => {
    const shapes: SheetModuleOptions = { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf" };
    const sheet = listFactsOf(() => emitSheetModule(SHAPE_COLUMNS, shapes));
    expect(sourceOf(sheet.emitted)).toBe(sourceOf(emitSheetModule(SHAPE_COLUMNS, shapes)));
    expect(sheet.facts.size).toBeGreaterThan(10);
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const merged = listFactsOf(() => emitModule(NODE_SHAPE, node));
    expect(sourceOf(merged.emitted)).toBe(sourceOf(emitModule(NODE_SHAPE, node)));
    // The value of the run is the append of the shapes of the rows and of the columns, so it is clean.
    expect(factOf(merged.facts, NODE_SHAPE).clean).toBe(true);
    // Without a test of the analysis, the printer notes nothing.
    expect(listFactsOf(() => ({ ok: false, reason: "none" })).facts.size).toBe(0);
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the facts clean and fresh of each list", () => {
  it("COMPILE.MODULE.FUSE.FACTS LIST.BUILD: the value of append, flat, without, sortBy, take and drop is clean and not fresh", () => {
    const flat = op("flat", each(axes.window(0, 1), op("fill", lit(1), ref("w"))));
    const lists = [op("append", inv, inv), op("without", inv, inv), op("sortBy", inv), op("take", inv, lit(2)), op("drop", inv, lit(1)), op("sortBy", inv, lit({ by: "negate" }))];
    for (const list of lists) expect(short(op("count", list), list)).toStrictEqual({ clean: true, fresh: false, reads: 1 });
    // With fuse, flat over an each is one loop with its own output, so it is fresh (COMPILE.MODULE.FUSE).
    expect(short(op("count", flat), flat, { ...OPTIONS, fuse: false })).toStrictEqual({ clean: true, fresh: false, reads: 1 });
    expect(short(op("count", flat), flat)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    // The list that each op reads can hold error items.
    expect(short(op("count", op("append", inv, inv)), inv)).toStrictEqual({ clean: false, fresh: false, reads: 1 });
  });

  it("COMPILE.MODULE.FUSE.FACTS LIST.FILL: the value of fill is clean and fresh, and its items keep the facts of the value", () => {
    expect(short(op("count", one), one)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    const lists = op("fill", lit(2), one);
    const f = factOf(factsOf(op("count", lists)), lists);
    // The items of fill share one array, so an item is not fresh, but it keeps the fact clean.
    expect(f).toStrictEqual({ clean: true, fresh: true, inner: [true], reads: 1 });
    const dirty = op("fill", lit(2), inv);
    expect(factOf(factsOf(op("count", dirty)), dirty).inner).toStrictEqual([false]);
  });

  it("COMPILE.MODULE.FUSE.FACTS LIST.LITERAL: a literal is clean only without error items, and it is never fresh", () => {
    const good = lit(vexList([item("a", 1), item("b", 2)]));
    const bad = lit(vexList([item("a", 1), errorItem("b")]));
    const empty = lit(vexList([]));
    for (const [list, clean] of [[good, true], [bad, false], [empty, true]] as const) expect(short(op("count", op("append", list, one)), list)).toStrictEqual({ clean, fresh: false, reads: Infinity });
  });

  it("COMPILE.MODULE.FUSE.FACTS: an each is clean when its item cannot throw", () => {
    // An aggregate over an each prints no list, so the each is an argument of append here.
    const used = (list: Expr): ListFacts => factOf(factsOf(op("count", op("append", list, one))), list);
    const safe = each(axes.window(-1, 1), lit(1));
    expect(used(safe)).toStrictEqual({ clean: true, inner: [], fresh: false, reads: 1 });
    // A division can throw, so the catch of an item can put the sentinel into the list.
    expect(used(inv).clean).toBe(false);
    // With fuse false, the axis list tests each item for the sentinel, so each over a list is not clean. With fuse, a
    // clean list has no test (COMPILE.MODULE.FUSE.CLEAN), but a list that is not clean keeps it.
    const overList = each(axes.list(one), lit(1));
    expect(factOf(factsOf(op("count", op("append", overList, one)), { ...OPTIONS, fuse: false }), overList).clean).toBe(false);
    expect(used(overList).clean).toBe(true);
    expect(used(each(axes.list(ref("xs")), lit(1))).clean).toBe(false);
    // A test that is a safe boolean keeps the fact. A test that can throw removes it.
    expect(used(each(axes.where(axes.window(-1, 1), v("t")), lit(1))).clean).toBe(true);
    expect(used(each(axes.where(axes.window(-1, 1), op("gt", op("divide", lit(1), ref("w")), lit(0))), lit(1))).clean).toBe(false);
    // An each of lists keeps the facts of the list of its body for its items.
    const nested = each(axes.window(-1, 1), op("fill", lit(1), ref("w")));
    expect(factOf(factsOf(op("count", op("flat", nested)), { ...OPTIONS, fuse: false }), nested).inner).toStrictEqual([true]);
  });

  it("COMPILE.MODULE.FUSE.FACTS COMPILE.MODULE.LIST.INPUT: a list of the input can hold error items, so it is not clean", () => {
    const xs = ref("xs");
    expect(short(op("count", xs), xs)).toStrictEqual({ clean: false, fresh: false, reads: 1 });
  });

  it("COMPILE.MODULE.FUSE.FACTS: if and ifError join the facts of their branches", () => {
    const empty = lit(vexList([]));
    const two = op("if", ref("b"), one, op("fill", lit(2), n));
    expect(short(op("count", two), two)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    // The empty list is a constant of the run, so the value of the if can be the array of that constant.
    for (const e of [op("if", ref("b"), one, empty), op("if", ref("b"), empty, one)]) expect(short(op("count", e), e)).toStrictEqual({ clean: true, fresh: false, reads: 1 });
    const mixed = op("if", ref("b"), one, inv);
    expect(short(op("count", mixed), mixed)).toStrictEqual({ clean: false, fresh: false, reads: 1 });
    const caught = op("ifError", inv, one);
    expect(short(op("count", caught), caught).clean).toBe(false);
    // The append of a dirty list of lists keeps the facts of the items of each list.
    const joined = op("append", op("fill", lit(1), inv), op("fill", lit(1), one));
    expect(factOf(factsOf(op("count", joined)), joined).inner).toStrictEqual([false]);
    const both = op("append", op("fill", lit(1), one), op("fill", lit(1), one));
    expect(factOf(factsOf(op("count", both)), both).inner).toStrictEqual([true]);
  });
});

describe("COMPILE.MODULE.FUSE.FACTS: the names, the loops and the cells", () => {
  it("COMPILE.MODULE.FUSE.FACTS LET.BIND: a binding has the count of the reads of its name, and a read of a name is not fresh", () => {
    const once = let_({ ys: one }, op("count", v("ys")));
    expect(short(once, one)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    const twice = let_({ ys: one }, op("add", op("count", v("ys")), op("sum", v("ys"))));
    expect(short(twice, one).reads).toBe(2);
    // The read in the body of an each evaluates for each record, so the count has no bound.
    const loop = let_({ ys: one }, op("sum", each(axes.all, op("count", v("ys")))));
    expect(short(loop, one).reads).toBe(Infinity);
    const unused = let_({ ys: one }, lit(1));
    expect(short(unused, one).reads).toBe(0);
    // The read of the name holds the facts of the list, but it is not fresh.
    const read = v("ys");
    expect(short(let_({ ys: one }, op("count", read)), read)).toStrictEqual({ clean: true, fresh: false, reads: 1 });
    // A let in the body hides the name, so its reads do not count.
    const hidden = let_({ ys: one }, op("add", op("count", v("ys")), let_({ ys: inv }, op("count", v("ys")))));
    expect(short(hidden, one).reads).toBe(1);
  });

  it("COMPILE.MODULE.FUSE.FACTS LET.BIND: the count of the reads looks into each part of the program", () => {
    const ys = v("ys");
    // Another list, so the list of the binding is at one place of the program.
    const two = op("fill", lit(2), n);
    // An each reads its list once, and its body and its tests for each item.
    expect(reads(op("count", each(axes.list(ys), lit(1))))).toBe(1);
    expect(reads(op("count", each(axes.where(axes.all, op("gt", op("count", ys), lit(0))), lit(1))))).toBe(Infinity);
    expect(reads(op("count", each(axes.list(two), op("add", ys, lit(1)), undefined, ["ys"])))).toBe(0);
    // A loop reads its first values once, and its steps at each step. The names of the loop hide the name.
    expect(reads(iterate(2, { s: op("count", ys) }, { s: op("add", v("s"), op("count", ys)) }, v("s")))).toBe(Infinity);
    expect(reads(iterate(2, { s: op("count", ys) }, { s: v("s") }, op("count", ys)))).toBe(2);
    expect(reads(iterate(2, { ys: two }, { ys: op("append", v("ys"), two) }, op("count", v("ys"))))).toBe(0);
    expect(reads(iterate(2, { s: lit(0) }, { s: v("s") }, op("count", ys), op("gt", op("count", ys), lit(1))))).toBe(Infinity);
    expect(reads(fold(axes.where(axes.all, op("gt", op("count", ys), lit(0))), { s: lit(0) }, { s: v("s") }, v("s")))).toBe(Infinity);
    expect(reads(fold(axes.list(ys), { s: lit(0) }, { s: op("add", v("s"), v("y")) }, v("s"), undefined, ["y"]))).toBe(1);
    expect(reads(fold(axes.list(two), { s: lit(0) }, { s: op("add", v("s"), v("ys")) }, v("s"), undefined, ["ys"]))).toBe(0);
    // A function reads its argument at each read of its parameter, and the name of the let at each call.
    expect(reads(let_({ f: fn(["l"], op("count", ys)) }, call("f", lit(1))))).toBe(Infinity);
    expect(reads(let_({ f: fn(["ys"], op("add", v("ys"), lit(1))) }, call("f", lit(1))))).toBe(0);
  });

  it("COMPILE.MODULE.FUSE.FACTS FN.CALL: an argument has the count of the reads of its parameter", () => {
    const arg = op("fill", lit(1), n);
    const once = let_({ f: fn(["l"], op("count", v("l"))) }, call("f", arg));
    expect(short(once, arg)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    const twice = let_({ f: fn(["l"], op("add", op("count", v("l")), op("sum", v("l")))) }, call("f", arg));
    expect(short(twice, arg).reads).toBe(2);
    // A call of a name that is not a function gives a reason, and the analysis does not count its reads.
    expect(listFactsOf(() => emitModule(call("g", arg), OPTIONS)).emitted.ok).toBe(false);
    // The parameter keeps only the fact clean of its argument (COMPILE.MODULE.FUSE.CLEAN). The node joins the facts of
    // the function for the clean argument and of the function for the argument that is not clean.
    const param = v("l");
    const value = let_({ f: fn(["l"], op("append", param, one)) }, op("add", op("count", call("f", one)), op("count", call("f", inv))));
    expect(short(value, param).clean).toBe(false);
    // The value of a call is the list of the body, and another part can hold it.
    const result = call("f", one);
    expect(short(let_({ f: fn(["l"], op("append", v("l"), one)) }, op("count", result)), result)).toStrictEqual({ clean: true, fresh: false, reads: 1 });
  });

  it("COMPILE.MODULE.FUSE.FACTS LOOP.LIST: a name of a loop is clean when its first list and each step are clean", () => {
    const step = (acc: Expr): Expr => iterate(3, { acc: one }, { acc }, op("count", v("acc")));
    expect(accClean(step(op("append", v("acc"), one)))).toBe(true);
    expect(accClean(step(op("if", ref("b"), v("acc"), op("fill", lit(1), n))))).toBe(true);
    expect(accClean(step(let_({ z: one }, op("append", v("acc"), v("z")))))).toBe(true);
    expect(accClean(step(lit(vexList([item("a", 1)]))))).toBe(true);
    expect(accClean(step(v("acc")))).toBe(true);
    // A step that is an each over the list can hold the sentinel, so the name is not clean.
    expect(accClean(step(each(axes.list(v("acc")), op("divide", lit(1), v("y")), undefined, ["y"])))).toBe(false);
    expect(accClean(step(lit(vexList([item("a", 1), errorItem("b")]))))).toBe(false);
    expect(accClean(step(let_({ acc: inv }, v("acc"))))).toBe(false);
    // The first value and the step of the loop are read again at each step.
    expect(short(step(op("append", v("acc"), one)), one).reads).toBe(Infinity);
  });

  it("COMPILE.MODULE.FUSE.FACTS LOOP.LIST: the fact of a name of a loop depends on the other names and on the names outside", () => {
    const names = (e: Expr): Readonly<Record<string, boolean>> => Object.fromEntries([...factsOf(e).entries()].flatMap(([x, f]) => (x.tag === "var" ? [[x.name, f.clean]] : [])));
    // The step of p reads q, and q is not clean, so p is not clean after the first pass.
    const chain = iterate(2, { p: one, q: inv }, { p: v("q"), q: v("q") }, op("add", op("count", v("p")), op("count", v("q"))));
    expect(names(chain)).toStrictEqual({ p: false, q: false });
    const outer = let_({ o: one }, iterate(2, { p: one }, { p: v("o") }, op("count", v("p"))));
    expect(names(outer)).toStrictEqual({ o: true, p: true });
    const dirty = let_({ o: inv }, iterate(2, { p: one }, { p: v("o") }, op("count", v("p"))));
    expect(names(dirty)).toStrictEqual({ o: false, p: false });
    // In a fold, the name of an item hides a name outside the fold in the steps. The items of this list are not clean.
    const hidden = let_({ o: one }, fold(axes.list(op("fill", lit(2), inv)), { p: one }, { p: v("o") }, op("count", v("p")), undefined, ["o"]));
    expect(names(hidden)).toStrictEqual({ o: false, p: false });
    // The items of a name of a loop do not keep the facts of fusion, because a step can change them.
    const lists = iterate(2, { p: op("fill", lit(1), one) }, { p: v("p") }, op("count", op("flat", v("p"))));
    expect([...factsOf(lists).entries()].find(([x]) => x.tag === "var")?.[1].inner).toStrictEqual([false]);
  });

  it("COMPILE.MODULE.FUSE.FACTS: a constant of the run, a node of the memo and a column of the run are read again", () => {
    // fill of a literal is a constant of the run, so each key reads its one array.
    const constant = op("fill", lit(2), lit(1));
    expect(short(op("count", op("append", constant, one)), constant)).toStrictEqual({ clean: true, fresh: false, reads: Infinity });
    // The sort reads only the name k from outside, so it is a node of the memo with the key k.
    const sorted = op("sortBy", each(axes.where(axes.all, op("eq", ref("n"), v("k"))), ref("w")));
    expect(short(let_({ k: n }, op("sum", sorted)), sorted)).toStrictEqual({ clean: true, fresh: false, reads: Infinity });
    // A costly list that depends only on the target is a column of the run, so each key reads the array of the column.
    const w = ref("w");
    const heavy = op("max", op("abs", op("subtract", w, op("divide", n, lit(2)))), op("abs", op("add", w, op("multiply", n, lit(3)))));
    const column = op("fill", lit(2), heavy);
    const program = let_({ k: one }, op("sum", each(axes.window(-1, 1), op("count", op("append", column, v("k"))))));
    expect(sourceOf(emitModule(program, OPTIONS))).toContain("Q((");
    expect(short(program, column)).toStrictEqual({ clean: true, fresh: false, reads: Infinity });
  });

  it("COMPILE.MODULE.FUSE.FACTS FN.CALL: a node that prints two times has the facts of both prints", () => {
    // The function prints once for each signature: a list of the input, and a list with the keys of fill.
    const body = op("fill", lit(1), v("l"));
    const twice = let_({ f: fn(["l"], body) }, op("add", op("count", call("f", one)), op("count", call("f", ref("xs")))));
    expect(factOf(factsOf(twice), body)).toStrictEqual({ clean: true, inner: [false], fresh: true, reads: 1 });
  });

  it("COMPILE.MODULE.FUSE.FACTS SHEET.CELL: a cell of a column of lists is not clean", () => {
    const read = cell("shape");
    const columns = new Map<string, Expr>([
      ["shape", op("append", one, one)],
      ["size", op("count", read)],
    ]);
    const { emitted, facts } = listFactsOf(() => emitSheetModule(columns, SHEET));
    expect(sourceOf(emitted)).toBe(sourceOf(emitSheetModule(columns, SHEET)));
    expect(factOf(facts, read).clean).toBe(false);
    expect(factOf(facts, columns.get("shape") as Expr).clean).toBe(true);
  });
});

type Run = (records: unknown, vars: unknown, parents?: unknown) => unknown;
interface Loaded {
  readonly run: Run;
  readonly VEX_ERROR: unknown;
}

/** This function makes the module of a source with `new Function`, as a build loads it. */
function make(source: string): Loaded {
  // oxlint-disable-next-line typescript/no-implied-eval -- the source comes from the printer, as in a build.
  return new Function(`${source.replaceAll(/^export /gm, "")}\nreturn { run, VEX_ERROR };`)() as Loaded;
}

/** This function gives a value of the interpreter in the form of a module: an error item has the error `VEX_ERROR`. */
function asModule(value: unknown, error: unknown): unknown {
  if (isVexList(value)) return { kind: "vex.list", items: value.items.map((x) => ({ key: x.key, result: x.result.ok ? { ok: true, value: asModule(x.result.value, error) } : { ok: false, error } })) };
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, asModule(x, error)]));
}

/** This function gives a list of the input, as plain data. An item with the value `undefined` is an error item. */
const input = (...values: (number | undefined)[]): object => ({
  kind: "vex.list",
  items: values.map((x, i) => (x === undefined ? { key: String(i), result: { ok: false, error: { code: "#N/A", kind: "missing-field", message: "no value", path: [] } } } : { key: String(i), result: { ok: true, value: x } })),
});
/** The records of the tests. The record with `w` 0 gives an error item in `inv`, and two lists of `xs` have error items. */
const RECORDS = [
  { n: 3, w: 1, b: true, xs: input(3, 1, 2) },
  { n: -1, w: 0, b: false, xs: input(5, undefined, -1) },
  { n: 0, w: 2, b: true, xs: input() },
  { n: 2, w: -1, b: false, xs: input(undefined) },
];
const VARS = { t: true };

/** This function gives the source of a program with the option `fuse`. */
const printed = (e: Expr, fuse: boolean): string => sourceOf(emitModule(e, { ...OPTIONS, fuse }));

/** This function compares the modules of fuse true and of fuse false with the interpreter at each key (P17). */
function expectSame(e: Expr, records: readonly unknown[] = RECORDS): void {
  const s = space.array(records);
  const results = s.keys.map((origin) => evaluate(e, { space: s, origin, vars: VARS, domains: OPTIONS.domains ?? [] }));
  for (const fuse of [true, false]) {
    const m = make(printed(e, fuse));
    const copy = structuredClone(records);
    expect(m.run(copy, VARS)).toStrictEqual(results.map((r) => (r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR)));
    expect(copy).toStrictEqual(records);
  }
}

/** This function gives the count of the functions of the program in a source. */
const functions = (source: string): number => source.match(/const fn\d+ = \(/g)?.length ?? 0;

/** A clean list at each key: the list of `fill`. */
const two = op("fill", lit(2), n);
/** A list of the input, which can hold error items, so it is not clean. */
const xs = ref("xs");

/**
 * The ops with a clean form. `clean` is a part of the code of the clean form, and `plain` is a part of the code of the
 * plain form. A form without `clean` is the plain form without its test of the sentinel.
 */
const FORMS: readonly { readonly name: string; readonly of: (l: Expr) => Expr; readonly clean?: string; readonly plain: string }[] = [
  // The array of fill is fresh, so sortBy sorts it in place (COMPILE.MODULE.FUSE).
  { name: "sortBy", of: (l) => op("sortBy", l), clean: "SBI(", plain: "SB(" },
  { name: "sortBy by", of: (l) => op("sortBy", l, lit({ by: "negate" })), clean: "SKI(", plain: "SK(" },
  { name: "take", of: (l) => op("take", l, lit(1)), clean: "TKC(", plain: "TK(" },
  { name: "drop", of: (l) => op("drop", l, lit(1)), clean: "DRC(", plain: "DR(" },
  { name: "append", of: (l) => op("append", l, two), clean: ".concat(", plain: "AP(" },
  { name: "without", of: (l) => op("without", l, two), clean: "WOC(", plain: "WO(" },
  { name: "flat", of: (l) => op("flat", op("fill", lit(2), l)), clean: "FLC(", plain: "FL(" },
  { name: "indexOf", of: (l) => op("ifError", op("indexOf", l, lit(1)), lit(-1)), clean: "IXC(", plain: "IX(" },
  { name: "nth", of: (l) => op("ifError", op("nth", l, lit(1)), lit(-1)), clean: "NTC(", plain: "NT(" },
  { name: "count", of: (l) => op("count", l), clean: ".length", plain: "CT(" },
  { name: "first", of: (l) => op("ifError", op("first", l), lit(-1)), clean: "FSC(", plain: "FS(" },
  { name: "sum", of: (l) => op("sum", l), plain: "=== E) continue;" },
  { name: "each", of: (l) => each(axes.list(l), op("add", v("y"), lit(1)), undefined, ["y"]), plain: "[1] === E) F();" },
  { name: "fold", of: (l) => fold(axes.list(l), { s: lit(0) }, { s: op("add", v("s"), v("y")) }, v("s"), undefined, ["y"]), plain: "[1] === E) F();" },
  { name: "reverse", of: (l) => op("sum", each(axes.reverse(axes.list(l)), v("i"), undefined, ["y", "i"])), plain: "CT(" },
  { name: "result", of: (l) => l, clean: "LOC(", plain: "LO(" },
  { name: "record", of: (l) => rec({ l }), clean: "LVC(", plain: "LV(" },
  { name: "own", of: (l) => fold(axes.all, { acc: l }, { acc: op("append", v("acc"), two) }, v("acc")), clean: "AOC(", plain: "AO(" },
];

describe("COMPILE.MODULE.FUSE.CLEAN: the clean form of the list ops", () => {
  it("COMPILE.MODULE.FUSE.CLEAN: with fuse, an op over a clean list prints its clean form, and it gives the values of the interpreter", () => {
    for (const { name, of, clean, plain } of FORMS) {
      const on = printed(of(two), true);
      const off = printed(of(two), false);
      const dirty = printed(of(xs), true);
      expect({ name, plain: on.includes(plain), clean: clean === undefined || on.includes(clean) }).toStrictEqual({ name, plain: false, clean: true });
      // fuse false and a list that is not clean keep the plain form.
      expect({ name, off: off.includes(plain), dirty: dirty.includes(plain) }).toStrictEqual({ name, off: true, dirty: true });
      // The texts of the helpers hold `.concat(` and `.length`, so only the names of the helpers are not in the plain form.
      const helper = clean?.startsWith(".") === false ? clean : "(none)";
      expect({ name, off: off.includes(helper), dirty: dirty.includes(helper) }).toStrictEqual({ name, off: false, dirty: false });
      for (const l of [two, xs]) expectSame(of(l));
    }
  });

  it("COMPILE.MODULE.FUSE.CLEAN: an op with two lists or with lists of lists prints the clean form only when each list is clean", () => {
    for (const [o, plain] of [["append", "AP("], ["without", "WO("]] as const) {
      expect(printed(op("count", op(o, two, xs)), true)).toContain(plain);
      expect(printed(op("count", op(o, xs, two)), true)).toContain(plain);
      for (const [a, b] of [[two, xs], [xs, two], [two, two]] as const) expectSame(op(o, a, b));
    }
    // flat reads the items of each item, so a clean list of lists that are not clean keeps FL.
    const nested = op("flat", op("fill", lit(2), xs));
    expect(printed(nested, true)).toContain("FL(");
    // The envelope of a list of lists reads each level, so each level must be clean.
    expect(printed(op("fill", lit(2), xs), true)).toContain("LO(");
    expect(printed(op("fill", lit(2), two), true)).toContain("LOC(");
    // The empty list has no level of items, so flat has the clean form.
    expect(printed(op("flat", lit(vexList([]))), true)).toContain("FLC(");
    for (const e of [nested, op("fill", lit(2), xs), op("fill", lit(2), two), op("flat", lit(vexList([])))]) expectSame(e);
  });

  it("COMPILE.MODULE.FUSE.CLEAN: the strict ops over a clean list cannot fail, and the error items of the input stay errors", () => {
    const strict = lit({ strict: true });
    for (const l of [two, xs]) {
      const forms = [op("count", l, strict), op("sum", l, strict), op("ifError", op("first", l, strict), lit(-2)), op("ifError", op("nth", l, lit(0), strict), lit(-2)), op("ifError", op("take", l, lit(1), strict), lit(vexList([]))), op("sortBy", l, strict)];
      for (const e of forms) expectSame(e);
    }
    // The ops of LIST.BUILD remove the error items, so their value is clean, and the op after it has the clean form.
    const built = op("count", op("append", xs, xs));
    expect(printed(built, true)).toContain(".length");
    expectSame(built);
  });

  it("COMPILE.MODULE.FUSE.CLEAN LIST.LITERAL: a literal with error items keeps the plain form, and gives the values of the interpreter", () => {
    const good = lit(vexList([item("a", 1), item("b", 2)]));
    const bad = lit(vexList([item("a", 1), errorItem("b"), item("c", 3)]));
    const forms = (l: Expr): readonly Expr[] => [op("count", op("append", l, two)), let_({ ys: op("append", l, two) }, op("sum", each(axes.list(v("ys")), v("y"), undefined, ["y"]))), op("count", l), op("sum", l), l, op("sortBy", l)];
    for (const e of [...forms(good), ...forms(bad)]) expectSame(e);
    expect(printed(op("sortBy", good), true)).toContain("SBC(");
    expect(printed(op("sortBy", bad), true)).toContain("SB(");
  });

  it("COMPILE.MODULE.FUSE.CLEAN SHEET.CELL: a cell of a column of lists keeps the plain form, and gives the results of SheetRun", () => {
    const kinds = { shape: { list: "number" }, size: "number", total: "number", joined: "number", back: { list: "number" } } as const;
    const options: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", n: "number" } }, kinds };
    // The column shape has an error item at each key whose window holds the record with v 0.
    const columns = new Map<string, Expr>([
      ["shape", each(axes.window(-1, 1), op("divide", lit(1), ref("v")))],
      ["size", op("count", cell("shape"))],
      ["total", op("sum", cell("shape"))],
      ["joined", op("count", op("append", cell("shape"), op("fill", lit(1), ref("n"))))],
      ["back", op("sortBy", cell("shape"))],
    ]);
    const records = [
      { v: 1, n: 2 },
      { v: 0, n: 1 },
      { v: 2, n: 0 },
      { v: 4, n: 3 },
      { v: 5, n: -1 },
    ];
    const s = space.array(records);
    const run = new SheetRun(columns, { space: s, domains: [NumDomain] });
    for (const fuse of [true, false]) {
      const source = sourceOf(emitSheetModule(columns, { ...options, fuse }));
      const m = make(source);
      const results = (c: string): unknown[] =>
        s.keys.map((k) => {
          const r = run.cell(c, k);
          return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
        });
      expect(m.run(structuredClone(records), {})).toStrictEqual(Object.fromEntries([...columns.keys()].map((c) => [c, results(c)])));
      // A read of a cell is not clean, and the append of a cell is clean.
      expect(source).toContain("CT(");
      expect(source).toContain("SB(");
      expect(source.match(/CT\(/g)?.length).toBe(fuse ? 2 : 3);
    }
  });

  it("COMPILE.MODULE.FUSE.CLEAN FN.CALL: the fact clean of a list is a part of the signature, and a function for a list that is not clean serves each call", () => {
    const body = fn(["l"], op("add", op("count", v("l")), op("sum", v("l"))));
    const calls = (first: Expr, ...rest: Expr[]): Expr => let_({ f: body }, rest.reduce((x, a) => op("add", x, call("f", a)), call("f", first)));
    const three = op("fill", lit(3), n);
    // Two clean arguments share the clean function, and its body has the clean form.
    const cleanCalls = calls(two, three);
    expect(functions(printed(cleanCalls, true))).toBe(1);
    expect(printed(cleanCalls, true)).not.toContain("CT(");
    // A call with a list that is not clean first prints the plain function, and a clean call after it takes it.
    expect(functions(printed(calls(xs, two), true))).toBe(1);
    expect(printed(calls(xs, two), true)).toContain("CT(");
    // A clean call first prints the clean function, so a call after it with a list that is not clean prints the plain one.
    expect(functions(printed(calls(two, xs), true))).toBe(2);
    expect(functions(printed(calls(two, xs, three, xs), true))).toBe(2);
    // With fuse false, one function serves each call.
    for (const e of [calls(two, xs), calls(xs, two), cleanCalls]) expect(functions(printed(e, false))).toBe(1);
    for (const e of [cleanCalls, calls(xs, two), calls(two, xs), calls(two, xs, three, xs)]) expectSame(e);
  });

  it("COMPILE.MODULE.FUSE.CLEAN COMPILE.MODULE.FUSE.FACTS: a name of a let and the value of a loop keep the fact clean of their form", () => {
    const step = (acc: Expr): Expr => iterate(3, { acc: one }, { acc }, op("count", v("acc")));
    expect(accClean(step(let_({ z: one }, v("z"))))).toBe(true);
    expect(accClean(step(let_({ z: inv }, v("z"))))).toBe(false);
    // A binding sees the names outside the let, so the name of the binding has the fact of the name of the loop.
    expect(accClean(step(let_({ z: v("acc") }, v("z"))))).toBe(true);
    // The value of an inner loop is clean when its result is clean with the facts of its own names.
    expect(accClean(step(iterate(2, { q: v("acc") }, { q: op("append", v("q"), one) }, v("q"))))).toBe(true);
    expect(accClean(step(iterate(2, { q: inv }, { q: v("q") }, v("q"))))).toBe(false);
    expect(accClean(step(fold(axes.all, { q: v("acc") }, { q: op("append", v("q"), one) }, v("q"))))).toBe(true);
    // The name of an item of a fold is not clean in the steps, and the result reads the names outside.
    expect(accClean(step(fold(axes.list(op("fill", lit(2), inv)), { q: one }, { q: v("q2") }, v("q"), undefined, ["q2"])))).toBe(false);
    expect(accClean(step(fold(axes.all, { q: inv }, { q: v("q") }, v("acc"))))).toBe(true);
    // The form of a call does not prove its list clean.
    expect(accClean(let_({ f: fn(["l"], v("l")) }, step(call("f", v("acc")))))).toBe(false);
    const steps = [let_({ z: one }, v("z")), iterate(2, { q: v("acc") }, { q: op("append", v("q"), one) }, v("q")), fold(axes.all, { q: v("acc") }, { q: op("append", v("q"), one) }, v("q"))];
    for (const acc of steps) expectSame(iterate(3, { acc: one }, { acc }, rec({ c: op("count", v("acc")), l: v("acc") })));
  });
});

/** The empty list, the body of a filter that keeps no item. */
const NONE = lit(vexList([]));
/** A literal with an error item, as a source and as a body. */
const BAD = lit(vexList([item("a", 1), errorItem("b"), item("c", 3)]));
const STRICT = lit({ strict: true });
/** This function gives flat over an each of `axes.all`. */
const flatOf = (body: Expr, ...rest: Expr[]): Expr => op("flat", each(axes.all, body), ...rest);

describe("COMPILE.MODULE.FUSE: flat over an each is one loop", () => {
  it("COMPILE.MODULE.FUSE: with fuse, flat over an each prints one loop with one output, and fuse false keeps FL", () => {
    const e = op("sum", flatOf(op("fill", lit(2), n)));
    const on = printed(e, true);
    expect(on).not.toMatch(/\bFLC?\(/);
    expect(on).toContain("for (let i = 0; i < z");
    expect(printed(e, false)).toMatch(/\bFLC?\(/);
    // The filter form pushes the value of the target, and an empty list pushes nothing.
    const filter = op("count", flatOf(op("if", op("gt", n, lit(0)), op("fill", lit(1), n), NONE)));
    expect(printed(filter, true)).toMatch(/o\d+\.push\(\[0, /);
    expect(printed(filter, true).split("export function run")[1]).not.toContain("else");
    for (const x of [e, filter]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE: a name that is read again and a node of the memo do not fuse", () => {
    // The list of the each is a name that the program reads two times, so flat reads the name and keeps FL.
    const lists = each(axes.window(-1, 1), op("fill", lit(1), n));
    const twice = let_({ ys: lists }, op("add", op("count", op("flat", v("ys"))), op("count", v("ys"))));
    expect(printed(twice, true)).toMatch(/\bFLC?\(/);
    // A list of the run that the program reads two times is a node of the memo, so flat reads its value.
    const run = each(axes.all, op("fill", lit(1), ref("w")));
    const memo = op("add", op("count", run), op("sum", op("flat", run)));
    expect(printed(memo, true)).toMatch(/\bFLC?\(/);
    // A node in a loop of each key prints at each read, so flat over it fuses.
    const again = op("add", op("count", op("flat", lists)), op("count", lists));
    expect(printed(again, true)).not.toMatch(/\bFLC?\(/);
    // An options value that is not a literal falls back to the op, which gives the reason.
    expect(emitModule(op("flat", lists, ref("n")), OPTIONS).ok).toBe(false);
    for (const x of [twice, memo, again]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE: a fused flat is clean and fresh, so the op after it has the clean form", () => {
    // A window depends on the key, so the flat is not a constant of the run, which a name holds.
    const flat = op("flat", each(axes.window(-1, 1), xs));
    expect(short(op("count", flat), flat)).toStrictEqual({ clean: true, fresh: true, reads: 1 });
    expect(printed(op("count", flat), true)).toContain(".length");
    expect(printed(op("sortBy", flat), true)).toContain("SBI(");
    for (const x of [op("count", flat), op("sortBy", flat)]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE: the modules of NODE_SHAPE and of the shapes of ireko keep their golden code", async () => {
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const source = sourceOf(emitModule(NODE_SHAPE, node));
    await expect(source).toMatchFileSnapshot("./__golden__/module-fuse.js");
    // The fused chains: the two lists of the bands of the children, UNSORTED, the three sides and the bands that stay.
    expect(source.match(/ = o\d+;$|\(o\d+\)|concat\(o\d+\)|^\s+\w+ = o\d+\.concat/gm)?.length).toBeGreaterThanOrEqual(5);
    expect(source).not.toMatch(/\bFL\(/);
    expect(source.match(/\.length = m\d+;/g)?.length).toBe(7);
  });
});

describe("COMPILE.MODULE.FUSE.ITEM: the error items of a fused flat", () => {
  it("COMPILE.MODULE.FUSE.ITEM: an error item of a list of the input is skipped, or it is the error with strict", () => {
    const lenient = flatOf(xs);
    expect(printed(lenient, true)).toMatch(/if \(z\d+\[i\]\[1\] !== E\) o\d+\.push/);
    const strict = op("ifError", flatOf(xs, STRICT), NONE);
    expect(printed(strict, true)).toMatch(/if \(z\d+\[i\]\[1\] === E\) F\(\);/);
    for (const x of [lenient, strict, op("count", lenient), op("sum", lenient)]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE.ITEM LIST.LITERAL: a literal with an error item, as the body or as the source, gives the values of the interpreter", () => {
    const forms = [flatOf(BAD), op("ifError", flatOf(BAD, STRICT), NONE), op("flat", each(axes.list(BAD), op("fill", lit(1), v("y")), undefined, ["y"])), op("ifError", op("flat", each(axes.list(BAD), op("fill", lit(1), v("y")), undefined, ["y"]), STRICT), NONE)];
    for (const x of forms) expectSame(x);
    expect(printed(flatOf(BAD), true)).toContain("!== E) o");
  });

  it("COMPILE.MODULE.FUSE.ITEM: a body that throws removes the items of its target, or it is the error with strict", () => {
    const body = op("fill", lit(2), op("divide", lit(1), ref("w")));
    const lenient = flatOf(body);
    const strict = op("ifError", flatOf(body, STRICT), NONE);
    // The lenient loop puts the length of the output back, and the strict loop raises the error.
    expect(printed(lenient, true)).toMatch(/\.length = m\d+;/);
    expect(printed(strict, true)).toMatch(/catch \{\n\s+F\(\);/);
    // The branches of a filter can throw too: the condition, and the value of the target.
    const filter = flatOf(op("if", op("gt", op("divide", lit(1), ref("w")), lit(0)), op("fill", lit(1), op("divide", n, ref("w"))), NONE));
    for (const x of [lenient, strict, filter, op("ifError", op("flat", each(axes.all, op("if", op("gt", op("divide", lit(1), ref("w")), lit(0)), op("fill", lit(1), n), NONE)), STRICT), NONE)]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE.ITEM SHEET.CELL: a cell in the body gives the results of SheetRun, and a strict loop reads each cell", () => {
    const options: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", n: "number" } }, kinds: { a: "number", l: { list: "number", texts: true }, s: { list: "number", texts: true }, k: { list: "number", texts: true } } };
    const columns = new Map<string, Expr>([
      ["a", op("divide", lit(1), ref("v"))],
      ["l", op("flat", each(axes.window(-1, 1), op("fill", lit(1), cell("a"))))],
      ["s", op("ifError", op("flat", each(axes.window(-1, 1), op("fill", lit(1), cell("a"))), STRICT), lit(vexList([])))],
      // A list of the column of lists is not clean, so the loop tests each item.
      ["k", op("flat", each(axes.window(-1, 0), cell("l")))],
    ]);
    const records = [
      { v: 1, n: 2 },
      { v: 0, n: 1 },
      { v: 2, n: 0 },
      { v: 4, n: 3 },
    ];
    const s = space.array(records);
    const run = new SheetRun(columns, { space: s, domains: [NumDomain] });
    for (const fuse of [true, false]) {
      const source = sourceOf(emitSheetModule(columns, { ...options, fuse }));
      const m = make(source);
      // With strict, the fused loop reads the cell of each target before it raises the error.
      expect(/if \(f\d+\) F\(\);/.test(source)).toBe(fuse);
      const results = (c: string): unknown[] => s.keys.map((k) => {
        const r = run.cell(c, k);
        return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
      });
      expect(m.run(structuredClone(records), {})).toStrictEqual(Object.fromEntries([...columns.keys()].map((c) => [c, results(c)])));
    }
  });
});

/** A list of one number at each key, from a fused flat over a window. */
const near = op("flat", each(axes.window(-1, 1), op("fill", lit(1), ref("w"))));
/** This function gives the count of the pushes of one item in a source. */
const pushes = (source: string): number => source.match(/o\d+\.push\(\[0, /g)?.length ?? 0;
/** This function gives an append with the option strict. */
const strictly = (a: Expr, b: Expr): Expr => op("append", a, b, STRICT);

describe("COMPILE.MODULE.FUSE: a chain of append is one output", () => {
  it("COMPILE.MODULE.FUSE: with fuse, a chain with a part that pushes has no concat, and fuse false keeps concat", () => {
    const withFlat = op("append", one, near);
    const fills = op("append", op("append", one, op("fill", lit(1), ref("w"))), one);
    for (const e of [withFlat, fills, op("append", near, op("append", xs, one))]) {
      expect(printed(e, true)).not.toMatch(/\.concat\(|\bAP\(/);
      expect(printed(e, false)).toMatch(/\.concat\(|\bAP\(/);
      for (const x of [e, op("count", e), op("sum", e)]) expectSame(x);
    }
    // Each fill pushes its item, and the loop of the flat pushes into the output of the chain.
    expect(pushes(printed(fills, true))).toBe(3);
    expect(printed(withFlat, true)).toMatch(/const o\d+ = o\d+;/);
    // An append of two arrays has no part that pushes, so it keeps concat or AP.
    expect(printed(op("append", two, two), true)).toContain(".concat(");
    expect(printed(op("append", xs, two), true)).toContain("AP(");
    // An options value that is not a literal falls back to the op, which gives the reason.
    expect(emitModule(op("append", one, near, ref("n")), OPTIONS).ok).toBe(false);
  });

  it("COMPILE.MODULE.FUSE: a part that the program reads again keeps its array, and the chain copies its items", () => {
    // The name ys is read two times, so the chain reads its array and a loop copies the items.
    const twice = let_({ ys: near }, op("add", op("count", op("append", one, v("ys"))), op("count", v("ys"))));
    const source = printed(twice, true);
    expect(source).toMatch(/const z\d+ = /);
    expect(source).not.toMatch(/\.concat\(|\bAP\(/);
    // A list of the run that the program reads two times is a node of the memo, so the chain reads its value.
    const run = each(axes.all, op("fill", lit(1), ref("w")));
    const memo = op("add", op("count", op("append", one, op("flat", run))), op("sum", op("flat", run)));
    expect(printed(memo, true)).toMatch(/const z\d+ = /);
    // A constant of the run evaluates once, before the loop over the keys, and the chain copies its items.
    const constant = op("append", one, op("flat", run));
    expect(printed(constant, true)).toMatch(/const z\d+ = /);
    for (const x of [twice, memo, constant]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE LIST.SORT: sortBy sorts a fresh array in place, and it copies each other array", () => {
    const fresh = op("append", one, op("fill", lit(1), ref("w")));
    expect(printed(op("sortBy", fresh), true)).toContain("SBI(");
    expect(printed(op("sortBy", fresh, lit({ by: "negate" })), true)).toContain("SKI(");
    // The value of AP and a name that is read two times are not fresh, so sortBy copies them.
    expect(printed(op("sortBy", op("append", xs, xs)), true)).toContain("SBC(");
    const shared = let_({ ys: fresh }, op("add", op("sum", op("sortBy", v("ys"))), op("count", v("ys"))));
    expect(printed(shared, true)).toContain("SBC(");
    expect(printed(shared, true)).not.toContain("SBI(");
    // With fuse false, the helpers of the sort in place are not in the module.
    expect(printed(op("sortBy", fresh), false)).not.toMatch(/SBI\(|SKI\(/);
    for (const x of [op("sortBy", fresh), op("sortBy", fresh, lit({ by: "negate" })), shared, op("sortBy", op("append", xs, xs))]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE LIST.SORT: the sort in place keeps the order of the items with equal sort values", () => {
    // The items with the value 1 have the keys 0, 0 and 2. A sort that is not stable can change their order.
    const records = [
      { n: 1, w: 1, b: true, xs: input(1, 2, 1) },
      { n: 2, w: -2, b: false, xs: input(2, -2, 2, 1) },
      { n: 0, w: 0, b: true, xs: input() },
    ];
    const lists = [op("append", one, xs), op("append", op("append", xs, one), op("fill", lit(1), ref("w")))];
    for (const l of lists) {
      expect(printed(op("sortBy", l), true)).toContain("SBI(");
      expect(printed(op("sortBy", l, lit({ by: "abs" })), true)).toContain("SKI(");
      for (const x of [op("sortBy", l), op("sortBy", l, lit({ by: "abs" })), op("sortBy", l, lit({ by: "negate" }))]) expectSame(x, records);
    }
  });

  it("COMPILE.MODULE.FUSE.ITEM LIST.BUILD: an error item of a part is skipped, or it is the error of the chain with strict", () => {
    for (const part of [xs, inv, BAD, near, NONE]) {
      const forms: readonly [Expr, Expr][] = [[part, one], [one, part], [one, op("append", part, near)]];
      for (const [a, b] of forms) for (const x of [op("append", a, b), op("count", op("append", a, b)), op("ifError", strictly(a, b), NONE)]) expectSame(x);
    }
    expect(printed(op("append", one, xs), true)).toMatch(/if \(z\d+\[i\]\[1\] !== E\) o\d+\.push/);
    expect(printed(op("ifError", strictly(one, xs), NONE), true)).toMatch(/if \(z\d+\[i\]\[1\] === E\) F\(\);/);
    // A strict append inside a lenient append applies strict to its own lists only.
    const inner = op("append", strictly(one, xs), op("append", BAD, one));
    expectSame(op("ifError", inner, NONE));
  });

  it("COMPILE.MODULE.FUSE.ITEM: a part that throws is the error of the chain, and a body that throws in a chain removes its items", () => {
    const fails = op("fill", lit(1), op("divide", lit(1), ref("w")));
    // A fill that throws after a push fails the chain, so the chain has no value at that key.
    for (const e of [op("append", one, fails), op("append", fails, one), op("append", near, op("append", one, fails))]) expectSame(e);
    // The body of the flat pushes n, and then it throws. The catch puts back the length of the output.
    const body = op("flat", each(axes.window(-1, 1), op("append", op("fill", lit(1), ref("n")), fails)));
    const chain = op("append", one, body);
    const source = printed(chain, true);
    expect(source).toMatch(/\.length = m\d+;/);
    expect(pushes(source)).toBe(3);
    const strict = op("ifError", op("append", one, op("flat", each(axes.window(-1, 1), op("append", one, fails)), STRICT)), NONE);
    for (const x of [body, chain, op("count", chain), strict]) expectSame(x);
  });

  it("COMPILE.MODULE.FUSE SHEET.CELL: in a sheet with a search, a chain that reads a cell keeps concat, and each sheet gives the results of SheetRun", () => {
    const kinds = { a: "number", next: "number", l: { list: "number", texts: true } } as const;
    const options: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", n: "number" } }, kinds };
    const direct = new Map<string, Expr>([
      ["a", op("divide", lit(1), ref("v"))],
      ["l", op("append", op("fill", lit(1), cell("a")), op("fill", lit(1), ref("n")))],
    ]);
    // The column next reads the cell after the key, so the sheet has a search.
    const search = new Map<string, Expr>([
      ["a", op("divide", lit(1), ref("v"))],
      ["next", op("ifError", cell("next", [offset(1)]), ref("v"))],
      ["l", op("append", op("fill", lit(1), cell("a")), op("fill", lit(1), cell("next")))],
    ]);
    const records = [
      { v: 1, n: 2 },
      { v: 0, n: 1 },
      { v: 2, n: 0 },
    ];
    const s = space.array(records);
    for (const [columns, fused] of [[direct, true], [search, false]] as const) {
      const run = new SheetRun(columns, { space: s, domains: [NumDomain] });
      const source = sourceOf(emitSheetModule(columns, options));
      expect(pushes(source) > 0).toBe(fused);
      const m = make(source);
      const results = (c: string): unknown[] => s.keys.map((k) => {
        const r = run.cell(c, k);
        return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
      });
      expect(m.run(structuredClone(records), {})).toStrictEqual(Object.fromEntries([...columns.keys()].map((c) => [c, results(c)])));
    }
  });
});

/** The name of a loop that appends to its own list, in the tests of COMPILE.MODULE.FUSE.ADOPT. */
const acc = v("acc");
/** This function tells if the variable of the appends of a name starts with the first list of the name. */
const adopts = (source: string): boolean => /let w\d+ = l\d+;/.test(source);
/** This function tells if the variable of the appends of a name starts with null, so the first append copies the list. */
const copies = (source: string): boolean => /let w\d+ = null;/.test(source);
/** This function gives the count of the appends into the array of a name of a loop, in the step and in the result. */
const owned = (source: string): number => source.match(/\(w\d+ = AOC?\(/g)?.length ?? 0;
/** This function gives an iteration of three steps with the one name `acc`. */
const thrice = (init: Expr, step: Expr, result: Expr = acc, until?: Expr): Expr => iterate(3, { acc: init }, { acc: step }, result, until);
/** This function gives a fold over a window with the one name `acc`. The window depends on the key, so the fold does too. */
const windowed = (init: Expr, step: Expr, result: Expr = acc): Expr => fold(axes.window(-1, 1), { acc: init }, { acc: step }, result);
/** A list that throws at the record with `w` 0. */
const fails = op("fill", lit(1), op("divide", lit(1), ref("w")));

/**
 * This function runs a module at each record and gives the count of the calls of `Array.prototype.concat`. The clean
 * form of an append copies a list with `concat`, so the count is the count of the copies. The body has no assertion,
 * because an assertion can call `concat` too.
 */
function concats(source: string, records: readonly unknown[] = RECORDS): number {
  const m = make(source);
  const d = Object.getOwnPropertyDescriptor(Array.prototype, "concat") as PropertyDescriptor;
  const original = d.value as (...args: unknown[]) => unknown;
  let count = 0;
  // oxlint-disable-next-line eslint/no-extend-native -- the test counts the copies of a list, and it restores concat.
  Object.defineProperty(Array.prototype, "concat", {
    ...d,
    value(this: unknown, ...args: unknown[]): unknown {
      count++;
      return Reflect.apply(original, this, args);
    },
  });
  try {
    m.run(structuredClone(records), VARS);
  } finally {
    // oxlint-disable-next-line eslint/no-extend-native -- the test puts back concat.
    Object.defineProperty(Array.prototype, "concat", d);
  }
  return count;
}

describe("COMPILE.MODULE.FUSE.ADOPT: an append takes a fresh first list as its own array", () => {
  it("COMPILE.MODULE.FUSE.ADOPT LOOP.LIST: a first list that is clean and fresh is the array of the appends, so the loop makes no copy", () => {
    const inits: readonly Expr[] = [one, two, near, op("fill", lit(0), n), op("sortBy", two), op("if", v("t"), one, two), let_({ z: n }, op("fill", lit(1), v("z"))), op("append", one, near)];
    for (const init of inits) {
      const loops = [thrice(init, op("append", acc, one)), windowed(init, op("if", ref("b"), op("append", acc, op("fill", lit(1), ref("w"))), acc)), thrice(init, op("append", op("append", acc, one), two))];
      for (const e of loops) {
        const on = printed(e, true);
        expect(adopts(on)).toBe(true);
        expect(concats(on)).toBe(0);
        // With fuse false, the first append copies the list, as in the version before.
        const off = printed(e, false);
        expect(adopts(off)).toBe(false);
        expect(copies(off)).toBe(true);
        expectSame(e);
      }
    }
    // A literal is never fresh, so its first append copies it: one copy at each key.
    const literal = thrice(lit(vexList([item("a", 1)])), op("append", acc, one));
    expect(copies(printed(literal, true))).toBe(true);
    expect(concats(printed(literal, true))).toBe(RECORDS.length);
    expectSame(literal);
  });

  it("COMPILE.MODULE.FUSE.ADOPT: a first list that another part holds, or that can hold error items, keeps the first copy", () => {
    // A name, a constant of the run, a node of the memo, a column of the run and the value of a call are held by other
    // parts. A list of the input and an each that can throw can hold error items.
    const sorted = op("sortBy", each(axes.where(axes.all, op("eq", n, v("k"))), ref("w")));
    const heavy = op("max", op("abs", op("subtract", ref("w"), op("divide", n, lit(2)))), op("abs", op("add", ref("w"), op("multiply", n, lit(3)))));
    const column = op("fill", lit(2), heavy);
    const inColumn = let_({ k: one }, op("sum", each(axes.window(-1, 1), op("count", thrice(column, op("append", acc, v("k")))))));
    const held: Record<string, Expr> = {
      twice: let_({ x: one }, thrice(v("x"), op("append", acc, one), rec({ acc, x: v("x") }))),
      constant: let_({ x: op("fill", lit(2), lit(1)) }, thrice(v("x"), op("append", acc, one), rec({ acc, x: v("x") }))),
      memo: let_({ k: n }, thrice(sorted, op("append", acc, one), op("sum", acc))),
      column: inColumn,
      call: let_({ f: fn(["m"], op("fill", lit(2), v("m"))) }, thrice(call("f", n), op("append", acc, one))),
      input: thrice(xs, op("append", acc, one)),
      inputStrict: op("ifError", thrice(xs, op("append", acc, one, STRICT)), NONE),
      errors: thrice(inv, op("append", acc, one)),
      appended: thrice(op("append", xs, xs), op("append", acc, one)),
    };
    for (const [name, e] of Object.entries(held)) {
      const source = printed(e, true);
      expect({ name, adopts: adopts(source), copies: copies(source) }).toStrictEqual({ name, adopts: false, copies: true });
      expectSame(e);
    }
    expect(printed(inColumn, true)).toContain("Q((");
  });

  it("COMPILE.MODULE.FUSE.ADOPT COMPILE.MODULE.APPEND.OWN: a name that another part of the loop reads has no array of its own", () => {
    // The step of c reads acc, the test reads acc, and the step of acc reads its list in a binding, as open in NODE_SHAPE.
    const readers: Record<string, Expr> = {
      otherName: fold(axes.window(-1, 1), { acc: one, c: one }, { acc: op("append", acc, one), c: acc }, rec({ acc, c: v("c") })),
      until: thrice(one, op("append", acc, one), acc, op("gt", op("count", acc), lit(2))),
      binding: thrice(one, let_({ base: op("if", ref("b"), op("drop", acc, lit(1)), acc) }, op("append", v("base"), one))),
      inX: thrice(one, op("append", acc, op("fill", lit(1), op("count", acc)))),
    };
    for (const [name, e] of Object.entries(readers)) {
      const source = printed(e, true);
      expect({ name, owned: owned(source), adopts: adopts(source) }).toStrictEqual({ name, owned: 0, adopts: false });
      expectSame(e);
    }
  });

  it("COMPILE.MODULE.FUSE.ADOPT: the last append of the result pushes into the array of the loop, also through a let that binds the list", () => {
    const last = (body: Expr): Expr => let_({ o2: op("if", ref("b"), op("append", acc, one), acc) }, body);
    const results: Record<string, readonly [Expr, number]> = {
      append: [op("append", acc, op("fill", lit(1), ref("w"))), 1],
      branch: [op("if", ref("b"), op("append", acc, one), acc), 1],
      chain: [op("append", op("append", acc, one), two), 2],
      relay: [last(op("if", v("t"), op("append", v("o2"), one), v("o2"))), 2],
      relays: [last(let_({ o3: op("append", v("o2"), one) }, op("append", v("o3"), two))), 3],
      rebind: [let_({ acc: op("append", acc, one) }, op("append", acc, two)), 2],
      free: [let_({ z: n, y: ref("w") }, op("append", acc, op("fill", lit(1), op("add", v("z"), v("y"))))), 1],
    };
    for (const [name, [result, count]] of Object.entries(results)) {
      for (const init of [one, lit(vexList([item("a", 1)]))]) {
        const e = thrice(init, op("append", acc, one), result);
        const source = printed(e, true);
        expect({ name, owned: owned(source) }).toStrictEqual({ name, owned: 1 + count });
        // A loop over a fresh first list copies no list. The literal gets one copy at each key.
        expect({ name, concats: concats(source) }).toStrictEqual({ name, concats: init === one ? 0 : RECORDS.length });
        expect(owned(printed(e, false))).toBe(1);
        expectSame(e);
      }
    }
    // A fold as the pairs of NODE_SHAPE: its result appends the last item of an odd count.
    const pairs = fold(
      axes.window(-1, 1),
      { odd: lit(false), a: lit(0), acc: op("fill", lit(0), lit(0)) },
      { odd: op("not", v("odd")), a: ref("w"), acc: op("if", v("odd"), op("append", acc, op("fill", lit(1), op("add", v("a"), ref("w")))), acc) },
      op("if", v("odd"), op("append", acc, op("fill", lit(1), v("a"))), acc),
    );
    expect(owned(printed(pairs, true))).toBe(2);
    expectSame(pairs);
  });

  it("COMPILE.MODULE.FUSE.ADOPT: a result that reads the old list after an append, or that restores it after an error, copies the list", () => {
    const count = op("fill", lit(1), op("count", acc));
    const keeps: Record<string, Expr> = {
      readAfter: op("append", op("append", acc, one), count),
      inTest: op("if", op("gt", op("count", acc), lit(1)), op("append", acc, one), acc),
      itself: op("append", acc, acc),
      record: rec({ a: op("append", acc, one), b: acc }),
      restore: op("ifError", op("append", op("append", acc, one), fails), acc),
      bodyReads: let_({ b: op("append", acc, one) }, op("append", v("b"), count)),
      twoBindings: let_({ b: op("append", acc, one), c: op("count", acc) }, op("append", v("b"), op("fill", lit(1), v("c")))),
      readsBinding: let_({ b: op("append", acc, one) }, op("append", v("b"), op("fill", lit(1), op("count", v("b"))))),
      notAList: let_({ b: op("append", acc, one) }, rec({ b: v("b"), c: op("count", v("b")) })),
      bodyNotAForm: let_({ b: op("append", acc, one) }, op("sortBy", v("b"))),
      restoreBinding: let_({ b: op("append", acc, one) }, op("ifError", op("append", v("b"), fails), v("b"))),
      shadow: let_({ acc: one }, op("append", acc, op("fill", lit(1), ref("w")))),
      otherLeaf: op("if", ref("b"), op("append", acc, one), two),
    };
    for (const [name, result] of Object.entries(keeps)) {
      const e = thrice(one, op("append", acc, one), result);
      expect({ name, owned: owned(printed(e, true)) }).toStrictEqual({ name, owned: 1 });
      expectSame(e);
    }
    // The let binds a new list to the name, so its append is a chain of COMPILE.MODULE.FUSE that pushes its item.
    expect(pushes(printed(thrice(one, op("append", acc, one), keeps["shadow"]), true))).toBe(1);
  });

  it("COMPILE.MODULE.FUSE.ADOPT FOLD.ERROR ITERATE.ERROR: an error of a step, of an item or of the result gives the values and the errors of the interpreter", () => {
    const errors: Record<string, Expr> = {
      // The step pushes one item, and then it throws, so the loop fails at that key.
      midStep: thrice(one, op("append", op("append", acc, one), fails)),
      fallBack: op("ifError", thrice(one, op("append", op("append", acc, one), fails)), op("fill", lit(1), n)),
      // The fallback is the node of the first list, so a change of the array of the loop would show in it.
      sameNode: op("ifError", thrice(two, op("append", acc, fails)), two),
      sameNodeAfter: rec({ a: op("ifError", thrice(two, op("append", acc, one), op("append", acc, fails)), NONE), b: two }),
      limit: thrice(one, op("append", acc, one), acc, op("gt", n, lit(10))),
      errorItems: thrice(one, op("append", op("append", acc, BAD), inv)),
      inputItems: thrice(near, op("append", acc, xs)),
      strictItems: op("ifError", thrice(one, op("append", acc, inv, STRICT)), NONE),
      strictResult: op("ifError", thrice(one, op("append", acc, one), op("append", acc, xs, STRICT)), NONE),
      resultThrows: thrice(one, op("append", acc, one), op("append", op("append", acc, one), fails)),
      inItem: op("flat", each(axes.window(-1, 1), thrice(one, op("append", acc, fails)))),
      inItemStrict: op("ifError", op("flat", each(axes.window(-1, 1), thrice(one, op("append", acc, fails))), STRICT), NONE),
    };
    for (const [name, e] of Object.entries(errors)) {
      expect({ name, adopts: adopts(printed(e, true)) }).toStrictEqual({ name, adopts: true });
      expectSame(e);
    }
    // The list of a fold is the node of the first list too, but each read prints its own array.
    const list = op("fill", lit(2), n);
    const over = fold(axes.list(list), { acc: list }, { acc: op("append", acc, op("fill", lit(1), v("y"))) }, acc, undefined, ["y"]);
    expect(adopts(printed(over, true))).toBe(true);
    expectSame(over);
  });

  it("COMPILE.MODULE.FUSE.ADOPT SHEET.CELL: a cell is not fresh, and a sheet with a fresh first list gives the results of SheetRun", () => {
    const kinds = { a: "number", l: { list: "number", texts: true }, own: { list: "number", texts: true }, fresh: { list: "number", texts: true } } as const;
    const options: SheetModuleOptions = { domains: [NumDomain], schema: { fields: { v: "number", n: "number" } }, kinds };
    const columns = new Map<string, Expr>([
      ["a", op("divide", lit(1), ref("v"))],
      ["l", op("fill", lit(2), ref("n"))],
      ["own", thrice(cell("l"), op("append", acc, op("fill", lit(1), ref("n"))))],
      ["fresh", thrice(op("fill", lit(1), cell("a")), op("append", acc, op("fill", lit(1), cell("a"))), op("append", acc, op("fill", lit(1), ref("n"))))],
    ]);
    const records = [
      { v: 1, n: 2 },
      { v: 0, n: 1 },
      { v: 2, n: 0 },
    ];
    const s = space.array(records);
    const run = new SheetRun(columns, { space: s, domains: [NumDomain] });
    for (const fuse of [true, false]) {
      const source = sourceOf(emitSheetModule(columns, { ...options, fuse }));
      // The column own reads the cell of l, so it copies. The column fresh takes its first list.
      expect(source.match(/let w\d+ = l\d+;/g)?.length ?? 0).toBe(fuse ? 1 : 0);
      expect(source.match(/let w\d+ = null;/g)?.length).toBe(fuse ? 1 : 2);
      const m = make(source);
      const results = (c: string): unknown[] => s.keys.map((k) => {
        const r = run.cell(c, k);
        return r.ok ? asModule(r.value, m.VEX_ERROR) : m.VEX_ERROR;
      });
      expect(m.run(structuredClone(records), {})).toStrictEqual(Object.fromEntries([...columns.keys()].map((c) => [c, results(c)])));
    }
  });

  it("COMPILE.MODULE.FUSE.ADOPT: the accumulators of NODE_SHAPE take their first lists, and the open bands keep their copy", () => {
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const on = sourceOf(emitModule(NODE_SHAPE, node));
    // The names out of the sweep and acc of the pairs start with fill(0), so both take their first lists. The step of
    // open reads its list in a binding, so open has no array of its own.
    expect(on.match(/let w\d+ = l\d+;/g)?.length).toBe(2);
    expect(on).not.toMatch(/let w\d+ = null;/);
    // Two steps and three appends of the results push in place.
    expect(owned(on)).toBe(5);
    const off = sourceOf(emitModule(NODE_SHAPE, { ...node, fuse: false }));
    expect(off.match(/let w\d+ = null;/g)?.length).toBe(2);
    expect(owned(off)).toBe(2);
  });
});

describe("COMPILE.MODULE.FUSE.ADOPT P17: random loops that append to the list of a name", () => {
  const part = fc.constantFrom(one, op("fill", lit(1), ref("w")), fails, BAD, inv, xs, NONE, near);
  const cond = fc.constantFrom(ref("b"), op("gt", n, lit(0)), op("gt", op("divide", lit(1), ref("w")), lit(0)), v("t"));
  /** This function gives a random form of COMPILE.MODULE.APPEND.OWN over the name `h`. */
  const form = (h: string): fc.Arbitrary<Expr> =>
    fc.letrec<{ form: Expr }>((tie) => ({
      form: fc.oneof(
        { maxDepth: 3, depthSize: "small" },
        fc.constant(v(h)),
        { arbitrary: fc.tuple(tie("form"), part, fc.boolean()).map(([x, y, s]) => op("append", x, y, ...(s ? [STRICT] : []))), weight: 3 },
        fc.tuple(cond, tie("form"), tie("form")).map(([c, yes, no]) => op("if", c, yes, no)),
        tie("form").map((body) => let_({ z: n }, body)),
      ),
    })).form;
  /** A random result: a form of the name, a let that binds a form to a new name, or a form that reads the old list. */
  const result = fc.oneof(
    form("acc"),
    fc.tuple(form("acc"), form("o2")).map(([x, body]) => let_({ o2: x }, body)),
    fc.tuple(form("acc"), part).map(([x, y]) => op("ifError", op("append", x, y, STRICT), acc)),
    form("acc").map((x) => op("append", x, op("fill", lit(1), op("count", acc)))),
  );
  const init = fc.constantFrom(one, two, near, op("fill", lit(0), n), op("if", v("t"), one, two), NONE, xs, inv, op("append", xs, one));
  const loops = fc.tuple(fc.constantFrom("iterate", "window", "list"), init, form("acc"), result).map(([kind, first, step, last]) => {
    if (kind === "iterate") return thrice(first, step, last);
    if (kind === "window") return windowed(first, step, last);
    return fold(axes.list(two), { acc: first }, { acc: step }, last, undefined, ["y"]);
  });

  it("P17 COMPILE.MODULE.FUSE.ADOPT COMPILE.MODULE.APPEND.OWN: the modules of fuse true and of fuse false give the values of the interpreter", () => {
    let modules = 0;
    let runs = 0;
    fc.assert(
      fc.property(loops, (e) => {
        runs++;
        if (!emitModule(e, OPTIONS).ok) return;
        modules++;
        expectSame(e);
      }),
      { numRuns: 300 },
    );
    expect(modules).toBeGreaterThan(runs / 2);
  });
});

describe("COMPILE.MODULE.FUSE P17: random chains of flat over an each and of append", () => {
  const num = fc.constantFrom(n, ref("w"), op("divide", lit(1), ref("w")), op("subtract", n, lit(1)));
  const cond = fc.constantFrom(ref("b"), op("gt", n, lit(0)), op("gt", op("divide", lit(1), ref("w")), lit(0)), v("t"));
  const axis = fc.constantFrom(axes.all, axes.others, axes.window(-1, 1), axes.reverse(axes.all), axes.where(axes.all, ref("b")));
  /** A random body: a list of each target, with filters, literals, lists of the input and inner chains. */
  const body = fc.letrec<{ list: Expr }>((tie) => ({
    list: fc.oneof(
      { maxDepth: 3, depthSize: "small" },
      num.map((x) => op("fill", lit(1), x)),
      fc.constantFrom(xs, inv, BAD, NONE, one, two),
      fc.tuple(fc.integer({ min: 0, max: 2 }), num).map(([k, x]) => op("fill", lit(k), x)),
      fc.tuple(cond, tie("list"), tie("list")).map(([c, a, b]) => op("if", c, a, b)),
      fc.tuple(cond, num).map(([c, x]) => op("if", c, op("fill", lit(1), x), NONE)),
      fc.tuple(tie("list"), tie("list"), fc.boolean()).map(([a, b, s]) => op("append", a, b, ...(s ? [STRICT] : []))),
      fc.tuple(axis, tie("list"), fc.boolean()).map(([a, b, s]) => op("flat", each(a, b), ...(s ? [STRICT] : []))),
    ),
  })).list;
  /** A random program: a flat over an each, or a chain of append at the root, with a sink. */
  const chain = fc.tuple(axis, body, fc.boolean(), fc.boolean(), fc.constantFrom("count", "sum", "list", "sortBy", "sortBy by")).map(([a, b, s, root, sink]) => {
    const list = root && b.tag === "app" && b.op === "append" ? b : op("flat", each(a, b), ...(s ? [STRICT] : []));
    if (sink === "sortBy") return op("ifError", op("sortBy", list), NONE);
    if (sink === "sortBy by") return op("ifError", op("sortBy", list, lit({ by: "abs" })), NONE);
    return sink === "list" ? op("ifError", list, NONE) : op(sink, list);
  });
  const records = fc.array(fc.record({ n: fc.integer({ min: -2, max: 3 }), w: fc.constantFrom(0, 1, -1, 2), b: fc.boolean(), xs: fc.array(fc.option(fc.integer({ min: -2, max: 3 }), { nil: undefined }), { maxLength: 3 }).map((x) => input(...x)) }, { noNullPrototype: true }), { maxLength: 5 });

  it("P17 COMPILE.MODULE.FUSE COMPILE.MODULE.FUSE.ITEM: the modules of fuse true and of fuse false give the values of the interpreter", () => {
    fc.assert(fc.property(chain, records, (e, rs) => expectSame(e, rs)), { numRuns: 300 });
  });
});
