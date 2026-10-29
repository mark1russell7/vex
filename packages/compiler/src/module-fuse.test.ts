/**
 * The first steps of the fusion of list ops in standalone modules (docs/COMPILER.md §7.6, COMPILE-FUSE). The option
 * `fuse` prints the code with and without fusion (COMPILE.MODULE.FUSE.OFF). The printer keeps the facts `clean` and
 * `fresh` of each list, and the count of the reads of each list node (COMPILE.MODULE.FUSE.FACTS). The facts do not
 * change the printed code.
 */
import { app, axes, call, cell, each, fn, fold, iterate, let_, lit, ref, v, vexList, type Expr, type ListItem } from "@mark1russell7/vex";
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

  it("COMPILE.MODULE.FUSE.OFF: fuse true, fuse false and the default print the same module in this version", () => {
    for (const e of programs) {
      const base = sourceOf(emitModule(e, OPTIONS));
      expect(sourceOf(emitModule(e, { ...OPTIONS, fuse: true }))).toBe(base);
      expect(sourceOf(emitModule(e, { ...OPTIONS, fuse: false }))).toBe(base);
    }
    const node = { domains: SHAPE_DOMAINS, schema: NODE_SCHEMA, name: "nodeShape" };
    const shapes: SheetModuleOptions = { domains: SHAPE_DOMAINS, schema: SHAPE_SCHEMA, kinds: SHAPE_KINDS, space: "tree", name: "shapesOf" };
    for (const fuse of [true, false]) {
      expect(sourceOf(emitModule(NODE_SHAPE, { ...node, fuse }))).toBe(sourceOf(emitModule(NODE_SHAPE, node)));
      expect(sourceOf(emitSheetModule(SHAPE_COLUMNS, { ...shapes, fuse }))).toBe(sourceOf(emitSheetModule(SHAPE_COLUMNS, shapes)));
    }
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
    const lists = [op("append", inv, inv), op("flat", each(axes.window(0, 1), op("fill", lit(1), ref("w")))), op("without", inv, inv), op("sortBy", inv), op("take", inv, lit(2)), op("drop", inv, lit(1)), op("sortBy", inv, lit({ by: "negate" }))];
    for (const list of lists) expect(short(op("count", list), list)).toStrictEqual({ clean: true, fresh: false, reads: 1 });
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
    // The axis list tests each item for the sentinel, so each over a list is not clean.
    expect(used(each(axes.list(one), lit(1))).clean).toBe(false);
    // A test that is a safe boolean keeps the fact. A test that can throw removes it.
    expect(used(each(axes.where(axes.window(-1, 1), v("t")), lit(1))).clean).toBe(true);
    expect(used(each(axes.where(axes.window(-1, 1), op("gt", op("divide", lit(1), ref("w")), lit(0))), lit(1))).clean).toBe(false);
    // An each of lists keeps the facts of the list of its body for its items.
    const nested = each(axes.window(-1, 1), op("fill", lit(1), ref("w")));
    expect(factOf(factsOf(op("count", op("flat", nested))), nested).inner).toStrictEqual([true]);
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
    // The parameter does not keep the facts of fusion of its argument, so one function serves each call.
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
