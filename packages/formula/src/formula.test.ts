import { app, cell, lit, offset, origin, parent, ref, SheetRun, space, type Expr, type Result } from "@mark1russell7/vex";
import { Vec2 } from "@mark1russell7/vex-domains";
import { describe, expect, it } from "vitest";
import { BUILT_IN_NAMES, compileFormula, FORMULA_DOMAINS, FUNCTIONS, highlightFormula, MAX_LENGTH, OP_NAMES, type FormulaContext } from "./index.ts";

// fruit ─┬─ apple
//        └─ pear
// tools ─── saw
// extra
const RECORDS = {
  fruit: { name: "fruit", cost: 1, qty: 1, active: true, pos: new Vec2(0, 0), size: new Vec2(3, 4), "Unit price": 9, children: 7 },
  apple: { name: "apple", cost: 2, qty: 3, active: true, pos: new Vec2(1, 1), size: new Vec2(1, 1), "Unit price": 2, children: 0 },
  pear: { name: "pear", cost: 5, qty: 1, active: false, pos: new Vec2(2, 2), size: new Vec2(1, 1), "Unit price": 5, children: 0 },
  tools: { name: "tools", cost: 4, qty: 2, active: true, pos: new Vec2(5, 5), size: new Vec2(2, 2), "Unit price": 4, children: 0 },
  saw: { name: "saw", cost: 3, qty: 1, active: true, pos: new Vec2(6, 6), size: new Vec2(1, 1), "Unit price": 3, children: 0 },
  extra: { name: "extra", cost: "x", qty: 1, active: false, pos: new Vec2(9, 9), size: new Vec2(1, 1), "Unit price": 1, children: 0 },
};
const TABLE = space.tree(RECORDS, { apple: "fruit", pear: "fruit", saw: "tools" });
const VALUES = ["name", "cost", "qty", "active", "pos", "size", "Unit price", "children"];

const compile = (text: string, formulas: readonly string[] = []): Expr => {
  const r = compileFormula(text, { valueColumns: VALUES, formulaColumns: formulas });
  if (!r.ok) throw new Error(`${r.error.message} at ${r.error.span.start}`);
  return r.expr;
};
const show = (r: Result<unknown>): unknown => (r.ok ? r.value : r.error.code);

/** The results of the formula columns at each row, as values or error codes. */
const table = (formulas: Readonly<Record<string, string>>): Record<string, Record<string, unknown>> => {
  const names = Object.keys(formulas);
  const run = new SheetRun(new Map(names.map((n) => [n, compile(formulas[n] ?? "", names)])), { space: TABLE, domains: FORMULA_DOMAINS });
  return Object.fromEntries(TABLE.keys.map((k) => [k, Object.fromEntries(names.map((n) => [n, show(run.cell(n, k))]))]));
};
const column = (text: string, rows: readonly string[] = ["fruit", "apple", "pear", "tools", "saw"]): unknown[] => {
  const t = table({ f: text });
  return rows.map((k) => t[k]?.["f"]);
};
/** The result of one formula at one row. */
const at = (text: string, k: string): unknown => table({ f: text })[k]?.["f"];
/** The result of one formula at the row apple. */
const value = (text: string): unknown => column(text, ["apple"])[0];
const error = (text: string, ctx: FormulaContext = { valueColumns: VALUES, formulaColumns: [] }): { message: string; span: { start: number; end: number } } => {
  const r = compileFormula(text, ctx);
  if (r.ok) throw new Error(`no error for ${text}`);
  return r.error;
};

describe("the text of a formula", () => {
  it("FORMULA.START: a formula can start with =, and white space has no effect", () => {
    expect(compile("=cost")).toEqual(ref(["cost"]));
    expect(compile("  cost  ")).toEqual(ref(["cost"]));
    expect(compile("= cost *\n qty")).toEqual(compile("cost*qty"));
  });

  it("FORMULA.LITERAL: numbers, texts with doubled quotes, and booleans", () => {
    expect([compile("2"), compile("0.5"), compile(".5"), compile("1e3"), compile("2.5E-1")]).toEqual([lit(2), lit(0.5), lit(0.5), lit(1000), lit(0.25)]);
    expect(compile('"say ""hi"""')).toEqual(lit('say "hi"'));
    expect([compile("TRUE"), compile("false"), compile("True")]).toEqual([lit(true), lit(false), lit(true)]);
    expect(error("1e999").message).toMatch(/too large/);
  });

  it("FORMULA.ERROR: an error has a message and a span, and the compiler does not throw", () => {
    expect(error("cost +")).toEqual({ message: "a value is necessary here, not the end of the formula", span: { start: 6, end: 6 } });
    expect(error('"open').span).toEqual({ start: 0, end: 5 });
    expect(error("nope + 1").span).toEqual({ start: 0, end: 4 });
    expect(error("cost qty").message).toMatch(/"qty" is not expected here/);
    expect(error("(cost").message).toMatch(/"\)" is necessary/);
    expect(error("cost # 1").message).toMatch(/"#" is not part of a formula/);
    expect(error("").message).toMatch(/empty/);
    expect(error("=").message).toMatch(/empty/);
    expect(error("[]").message).toMatch(/no column name/);
    expect(error("[cost").message).toMatch(/closing bracket/);
    expect(error("1".repeat(MAX_LENGTH + 1)).message).toMatch(/too long/);
  });
});

describe("names and navigation", () => {
  it("FORMULA.NAME: words and brackets, the same name in small letters, and errors", () => {
    expect(compile("[Unit price]")).toEqual(ref(["Unit price"]));
    expect(compile("[children]")).toEqual(ref(["children"]));
    expect(compile("COST")).toEqual(ref(["cost"]));
    expect(compileFormula("cost", { valueColumns: ["Cost", "cost"], formulaColumns: [] })).toMatchObject({ ok: true, expr: ref(["cost"]) });
    expect(error("[a.b]", { valueColumns: ["a.b"], formulaColumns: [] }).message).toMatch(/no dot/);
    expect(error("missing").message).toBe('the column "missing" does not exist');
  });

  it("FORMULA.NAME.VALUE and FORMULA.NAME.FORMULA: a value column is a ref, and a formula column is a cell", () => {
    expect(compile("cost")).toEqual(ref(["cost"]));
    expect(compile("total", ["total"])).toEqual(cell("total"));
    const t = table({ total: "cost * qty", double: "total * 2" });
    expect(t["apple"]).toEqual({ total: 6, double: 12 });
  });

  it("FORMULA.NAME.FORMULA: a cycle of formula columns gives #CYCLE!, and the other cells stay correct", () => {
    const t = table({ a: "b + 1", b: "a + 1", c: "cost + 1" });
    expect(t["apple"]).toEqual({ a: "#CYCLE!", b: "#CYCLE!", c: 3 });
  });

  it("FORMULA.NAV: this, parent and row(n) are moves of the address", () => {
    expect(compile("parent.cost")).toEqual(ref(["cost"], [parent]));
    expect(compile("row(-1).cost")).toEqual(ref(["cost"], [offset(-1)]));
    expect(compile("row(+2).cost")).toEqual(ref(["cost"], [offset(2)]));
    expect(compile("this.parent.row(1).cost")).toEqual(ref(["cost"], [origin, parent, offset(1)]));
    expect(compile("ROW(-1).total", ["total"])).toEqual(cell("total", [offset(-1)]));
    expect(error("row(1.5).cost").message).toMatch(/whole number/);
    expect(error("parent.").message).toMatch(/column name is necessary/);
    // A running total over the roots and in each group: row(-1) is the previous sibling. The first row has none.
    expect(column("IFERROR(row(-1).f, 0) + cost", ["fruit", "tools", "extra", "apple", "pear", "saw"])).toEqual([1, 5, "#VALUE!", 2, 7, 3]);
    expect(column("parent.name", ["apple", "saw", "fruit"])).toEqual(["fruit", "tools", "#REF!"]);
  });
});

describe("operators", () => {
  it("FORMULA.OPERATOR: + - * / ^ & are the ops of the domain of the left value", () => {
    expect(compile("cost * qty")).toEqual(app("multiply", ref(["cost"]), ref(["qty"])));
    expect(compile("-cost")).toEqual(app("negate", ref(["cost"])));
    expect(compile("-2")).toEqual(lit(-2));
    expect(column("cost * qty - 1")).toEqual([0, 5, 4, 7, 2]);
    expect(column("cost / 2 + cost ^ 2", ["apple"])).toEqual([5]);
    expect(column('name & "!" & qty', ["apple"])).toEqual(["apple!3"]);
    expect(column("pos + size", ["apple"])).toEqual([new Vec2(2, 2)]);
    expect(column("cost / 0", ["apple"])).toEqual(["#NUM!"]);
  });

  it("FORMULA.CONCAT: & joins the text of both values, also with a number on the left", () => {
    expect(compile('1 & "a"')).toEqual(app("concat", app("concat", lit(""), lit(1)), lit("a")));
    expect(column('qty & "x"', ["apple"])).toEqual(["3x"]);
    expect(column('1 & "a" & 2', ["apple"])).toEqual(["1a2"]);
    expect(column('name & cost', ["apple"])).toEqual(["apple2"]);
  });

  it("FORMULA.VEC: VEC(x, y) gives a vector, and a value that is not a number gives an error", () => {
    expect(column("VEC(1, 2)", ["apple"])).toEqual([new Vec2(1, 2)]);
    expect(column("VEC(cost, qty) + pos", ["apple"])).toEqual([new Vec2(3, 4)]);
    expect(column('VEC("a", 1)', ["apple"])).toEqual(["#VALUE!"]);
    expect(error("VEC(1)").message).toMatch(/VEC needs 2 arguments, not 1/);
  });

  it("FORMULA.COMPARE: = < <= > >= and <> give booleans", () => {
    expect(compile("cost <> 2")).toEqual(app("not", app("eq", ref(["cost"]), lit(2))));
    expect(column("cost > 2")).toEqual([false, false, true, true, true]);
    expect(column("cost <> 2")).toEqual([true, false, true, true, true]);
    expect(column('name = "pear"')).toEqual([false, false, true, false, false]);
    expect(column("cost <= 2", ["apple", "pear"])).toEqual([true, false]);
    expect(column("cost >= 5", ["apple", "pear"])).toEqual([false, true]);
    expect(column("cost < 2", ["fruit", "apple"])).toEqual([true, false]);
  });

  it("FORMULA.PRECEDENCE: the order of a spreadsheet, left-associative, and parentheses", () => {
    expect([value("1 + 2 * 3"), value("(1 + 2) * 3"), value("-2 ^ 2"), value("2 ^ 3 ^ 2"), value("10 - 4 - 3"), value("12 / 3 / 2")]).toEqual([7, 9, 4, 64, 3, 2]);
    expect(value('"x" & 2 + 3')).toBe("x5");
    expect(value("1 < 2 = TRUE")).toBe(true);
    expect(value("2 * -cost")).toBe(-4);
  });
});

describe("functions", () => {
  it("FORMULA.IF: only the selected branch evaluates, and the else value is FALSE by default", () => {
    expect(column('IF(cost > 2, "big", "small")')).toEqual(["small", "small", "big", "big", "big"]);
    expect(column("IF(FALSE, 1)", ["apple"])).toEqual([false]);
    expect(column("if(TRUE, 1, 1 / 0)", ["apple"])).toEqual([1]);
    expect(error("IF(TRUE)").message).toBe("IF needs 2 to 3 arguments, not 1");
  });

  it("FORMULA.IFERROR: the fallback for an error", () => {
    expect(column("IFERROR(1 / 0, 7)", ["apple"])).toEqual([7]);
    expect(column("IFERROR(cost, 0)", ["apple", "extra"])).toEqual([2, "x"]);
    expect(error("IFERROR(1)").message).toBe("IFERROR needs 2 arguments, not 1");
  });

  it("FORMULA.LOGIC: AND and OR stop at the deciding argument, and NOT is the op not", () => {
    expect(compile("AND(TRUE, active, FALSE)")).toEqual(app("and", lit(true), ref(["active"]), lit(false)));
    expect(column("AND(active, cost > 1)")).toEqual([false, true, false, true, true]);
    expect(column("OR(FALSE, active)", ["pear", "saw"])).toEqual([false, true]);
    expect(column("AND(FALSE, 1 / 0 > 1)", ["apple"])).toEqual([false]);
    expect(column("NOT(active)", ["apple", "pear"])).toEqual([false, true]);
    expect(error("AND()").message).toBe("AND needs 1 or more arguments, not 0");
    expect(error("NOT(TRUE, FALSE)").message).toBe("NOT needs 1 argument, not 2");
  });

  it("FORMULA.OP: another function name is an op of the standard domains", () => {
    expect(compile("DISTANCE(pos, size)")).toEqual(app("distance", ref(["pos"]), ref(["size"])));
    expect(compile("anynonpositive(pos)")).toEqual(app("anyNonPositive", ref(["pos"])));
    expect(column("ABS(-3) + ROUND(2.6) + SQRT(cost * 8)", ["apple"])).toEqual([10]);
    expect(column("UPPER(name) & LENGTH(name)", ["pear"])).toEqual(["PEAR4"]);
    expect(column("LENGTH(size)", ["fruit"])).toEqual([5]);
    expect(error("NOPE(1)").message).toBe('the function "NOPE" does not exist');
    expect(error("ABS()").message).toBe("ABS needs 1 or more arguments, not 0");
  });

  it("FORMULA.DOMAINS: Num, Bool, Text, Vec2, Color and Angle, in that order", () => {
    expect(FORMULA_DOMAINS.map((d) => d.name)).toEqual(["Num", "Bool", "Text", "Vec2", "Color", "Angle"]);
  });

  it("FORMULA.FUNCTIONS: an entry for each built-in function and for each op of the standard domains", () => {
    const names = FUNCTIONS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
    for (const b of BUILT_IN_NAMES) expect(names).toContain(b);
    for (const op of OP_NAMES.values()) expect(names).toContain(op.toUpperCase());
    expect(FUNCTIONS.find((f) => f.name === "DISTANCE")).toEqual({ name: "DISTANCE", signature: "DISTANCE(vector, value)", summary: "The op `distance` of the domain Vec2." });
    expect(FUNCTIONS.find((f) => f.name === "EQ")?.summary).toBe("The op `eq` of the domains Num, Bool, Text.");
    for (const f of FUNCTIONS) expect(f.signature.startsWith(`${f.name}(`)).toBe(true);
  });
});

describe("aggregates", () => {
  it("FORMULA.AGGREGATE: SUM, AVERAGE, MIN, MAX, COUNT, ANY and ALL over an axis", () => {
    expect(at("SUM(children.cost)", "fruit")).toBe(7);
    expect(at("sum(children, cost * qty)", "fruit")).toBe(11);
    expect(at("AVERAGE(children.cost)", "fruit")).toBe(3.5);
    expect([at("MIN(children.cost)", "fruit"), at("MAX(children.cost)", "fruit")]).toEqual([2, 5]);
    expect([at("COUNT(children)", "fruit"), at("COUNT(children)", "saw")]).toEqual([2, 0]);
    expect([at("ANY(children.active)", "fruit"), at("ALL(children.active)", "fruit")]).toEqual([true, false]);
    expect(at("SUM(descendants.qty)", "fruit")).toBe(4);
    expect(at("COUNT(ancestors)", "apple")).toBe(1);
    expect(at("SUM(siblings.cost)", "apple")).toBe(5);
    expect(at("COUNT(others)", "apple")).toBe(5);
    expect(at("COUNT(all)", "apple")).toBe(6);
    // A grand total over the children of each row, with a formula column of the children.
    const t = table({ total: "cost * qty + SUM(children.total)" });
    expect([t["fruit"]?.["total"], t["apple"]?.["total"]]).toEqual([12, 6]);
    expect(error("SUM(children)").message).toBe("SUM needs a value: write SUM(children.column) or SUM(children, value)");
    expect(error("SUM(children.cost, qty)").message).toMatch(/no second argument/);
  });

  it("FORMULA.AGGREGATE.STRICT: an error at one row makes the aggregate an error, and IFERROR skips it", () => {
    expect(at("SUM(all.cost)", "fruit")).toBe("#VALUE!");
    expect(at("SUM(all, IFERROR(cost * 1, 0))", "fruit")).toBe(15);
    expect(at("COUNT(all)", "fruit")).toBe(6);
  });

  it("FORMULA.AGGREGATE.WHERE: a test of the rows of the axis, and this. reads the row of the formula", () => {
    expect(at("SUM(children WHERE cost > 2, cost)", "fruit")).toBe(5);
    expect(at("COUNT(children WHERE active)", "fruit")).toBe(1);
    expect(at("SUM(children WHERE active, cost * qty)", "fruit")).toBe(6);
    expect(at("COUNT(others WHERE qty = this.qty)", "pear")).toBe(3);
    expect(at("COUNT(siblings where cost > this.cost)", "apple")).toBe(1);
  });

  it("FORMULA.AGGREGATE.ADDRESS: navigation before the axis is the address of the axis", () => {
    expect(column("SUM(parent.children.cost)", ["apple", "pear", "saw"])).toEqual([7, 7, 3]);
    expect(column("COUNT(parent.children)", ["fruit"])).toEqual(["#REF!"]);
  });

  it("FORMULA.AGGREGATE.OP: MIN, MAX and SUM without an axis are ops, and the other aggregates are errors", () => {
    expect(column("MIN(cost, 3) + MAX(cost, 3)", ["apple", "pear"])).toEqual([5, 8]);
    expect(column("SUM(size)", ["fruit"])).toEqual([7]);
    expect(error("AVERAGE(1, 2)").message).toBe("AVERAGE needs an axis as its first argument, for example AVERAGE(children.cost)");
    expect(error("COUNT(cost)").message).toMatch(/needs an axis/);
    expect(error("MIN()").message).toBe("MIN needs 1 or more arguments, not 0");
    // The function ALL is not the axis all: MAX(ALL(...), 0) is the op max of two values.
    expect(compile("MAX(ALL(children.active), 0)")).toMatchObject({ tag: "app", op: "max", args: [{ tag: "app", op: "all" }, { tag: "lit", value: 0 }] });
  });

  it("FORMULA.RANK: 1 plus the number of other rows with a larger value", () => {
    expect(column("RANK(qty)", ["fruit", "apple", "pear", "tools", "saw"])).toEqual([3, 1, 3, 2, 3]);
    // The cost of "extra" is a text, and the text domain has no op gt, so the rank is an error.
    expect(column("RANK(cost)", ["apple"])).toEqual(["#NAME?"]);
    expect(column("RANK(IFERROR(cost * 1, 0))", ["fruit", "apple", "pear", "tools", "saw", "extra"])).toEqual([5, 4, 1, 2, 3, 6]);
    expect(column("RANK(SUM(children.qty))", ["fruit", "tools", "saw"])).toEqual([1, 2, 3]);
    expect(error("SUM(children, RANK(cost))").message).toBe("RANK is not valid inside an aggregate");
    expect(error("RANK(1, 2)").message).toBe("RANK needs 1 argument, not 2");
  });
});

describe("the results of the compiler", () => {
  it("FORMULA.READS: each column that the formula reads, one time, in the sequence of the first read", () => {
    const r = compileFormula("qty * cost + SUM(children.cost) + parent.total + qty", { valueColumns: VALUES, formulaColumns: ["total"] });
    expect(r.ok && r.reads).toEqual(["qty", "cost", "total"]);
  });

  it("FORMULA.HIGHLIGHT: the kinds of the pieces of a formula", () => {
    const pieces = highlightFormula('= SUM(children WHERE [Unit price] > 2, cost) & "x" @');
    expect(pieces.map((p) => `${p.kind}:${p.text}`)).toEqual([
      "punct:=",
      "plain: ",
      "function:SUM",
      "punct:(",
      "keyword:children",
      "plain: ",
      "keyword:WHERE",
      "plain: ",
      "name:[Unit price]",
      "plain: ",
      "operator:>",
      "plain: ",
      "number:2",
      "punct:,",
      "plain: ",
      "name:cost",
      "punct:)",
      "plain: ",
      "operator:&",
      "plain: ",
      'string:"x"',
      "plain: ",
      "error:@",
    ]);
    expect(highlightFormula('"open').map((p) => p.kind)).toEqual(["error"]);
    expect(highlightFormula("[open").map((p) => p.kind)).toEqual(["error"]);
    expect(highlightFormula('"a""b" + 1 = 2').map((p) => p.kind)).toEqual(["string", "plain", "operator", "plain", "number", "plain", "operator", "plain", "number"]);
  });
});
