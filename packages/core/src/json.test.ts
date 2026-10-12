import { describe, expect, it } from "vitest";
import { explain } from "./evaluate.ts";
import { app, axes, each, ext, index, isExpr, key, let_, lit, offset, origin, other, parent, rec, v, type Expr } from "./ir.ts";
import { parse, serialize } from "./json.ts";
import { SheetRun } from "./sheet.ts";
import { applyMove, space, type Space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

/** Each position of a literal in the tree of an expression. */
const POSITIONS: readonly (readonly [string, (x: Expr) => Expr])[] = [
  ["an argument", (x) => app("add", x, lit(1))],
  ["a binding", (x) => let_({ a: x }, v("a"))],
  ["the body of let", (x) => let_({ a: lit(1) }, x)],
  ["a field", (x) => rec({ f: x })],
  ["the body of each", (x) => each(axes.all, x)],
  ["a where test", (x) => each(axes.where(axes.all, x), lit(1))],
  ["a where test in a where", (x) => each(axes.where(axes.where(axes.all, x), lit(true)), lit(1))],
];

/** This function reads the JSON text of a literal value, and gives the value. */
const read = (json: string): unknown => {
  const e = value(parse(`{"tag":"lit","value":${json}}`, [PtDomain]));
  return e.tag === "lit" ? e.value : undefined;
};

describe("the JSON form at each position of the tree (IR.JSON)", () => {
  it("IR.JSON.NUMBER: a literal -0 at each position round-trips", () => {
    for (const [, at] of POSITIONS) {
      const e = at(lit(-0));
      expect(value(parse(value(serialize(e))))).toEqual(e);
    }
  });

  it("IR.JSON: a value without a JSON form at each position gives #VALUE!", () => {
    for (const [, at] of POSITIONS) expect(error(serialize(at(lit(() => 1)))).kind).toBe("bad-expression");
    // A value without a JSON form in a list or a record of a literal also gives #VALUE!.
    expect(error(serialize(lit([1, () => 1]))).kind).toBe("bad-expression");
    expect(error(serialize(lit({ a: { b: () => 1 } }))).kind).toBe("bad-expression");
  });

  it("IR.JSON: a domain value at each position needs its decoder in parse", () => {
    for (const [, at] of POSITIONS) {
      const text = value(serialize(at(lit(new Pt(1, 2))), [PtDomain]));
      expect(error(parse(text)).message).toBe('no domain "Pt" decodes a literal');
      expect(value(parse(text, [PtDomain]))).toEqual(at(lit(new Pt(1, 2))));
    }
    // The decoder error stops the decode in a list and in a record too.
    const list = value(serialize(lit([new Pt(1, 2)]), [PtDomain]));
    expect(error(parse(list)).message).toBe('no domain "Pt" decodes a literal');
    const record = value(serialize(lit({ a: new Pt(1, 2) }), [PtDomain]));
    expect(error(parse(record)).message).toBe('no domain "Pt" decodes a literal');
  });

  it("IR.JSON.ESCAPE: a record with $vex that is not a complete form stays data", () => {
    expect(read('{"$vex":"escape","value":5}')).toEqual({ $vex: "escape", value: 5 });
    expect(read('{"$vex":"later","value":{"a":1}}')).toEqual({ $vex: "later", value: { a: 1 } });
    expect(read('{"$vex":"number","value":5}')).toEqual({ $vex: "number", value: 5 });
    expect(read('{"$vex":"number","value":"7"}')).toEqual({ $vex: "number", value: "7" });
    expect(read('{"$vex":"x","value":"-0"}')).toEqual({ $vex: "x", value: "-0" });
    expect(read('{"$vex":"domain","domain":5,"value":1}')).toEqual({ $vex: "domain", domain: 5, value: 1 });
    expect(read('{"$vex":"other","domain":"Pt","value":[1,2]}')).toEqual({ $vex: "other", domain: "Pt", value: [1, 2] });
    expect(read('{"$vex":"escape","value":{"$vex":"domain","domain":"Pt","value":[1,2]}}')).toEqual({ $vex: "domain", domain: "Pt", value: [1, 2] });
  });

  it("IR.JSON: parse gives an error, not an exception, for JSON that is not an expression", () => {
    for (const text of ["null", "5", '"x"', "[]", '{"tag":"lit"}', '{"tag":"app","op":"x"}', '{"tag":"let","bind":{}}', '{"tag":"each","axis":{"t":"all"}}', '{"tag":"rec"}']) {
      expect(error(parse(text)).kind).toBe("bad-expression");
    }
  });
});

describe("the edges of the address of an axis and of a tree offset", () => {
  it("AXIS.ADDRESS: the trace label names each move of the address", () => {
    const s = space.record({ A: { w: 1 }, B: { w: 2 } });
    const label = (at: Parameters<typeof each>[2]): string | undefined => explain(each(axes.all, lit(1), at), { space: s, origin: "A", domains: [] }).events.at(-1)?.label;
    expect(label([key("B"), index(0), other, origin])).toBe("each all from key(B).index(0).other.origin");
    expect(label([offset(1, 2)])).toBe("each all from offset(1, 2)");
    expect(label([parent])).toBe("each all from parent");
  });

  it("AXIS.ADDRESS: isExpr checks the address of an axis", () => {
    const base = { tag: "each", axis: { t: "all" }, body: lit(1) };
    expect(isExpr({ ...base, at: [] })).toBe(true);
    expect(isExpr({ ...base, at: [{ t: "parent" }] })).toBe(true);
    expect(isExpr({ ...base, at: "parent" })).toBe(false);
    expect(isExpr({ ...base, at: [{ t: "bogus" }] })).toBe(false);
    expect(isExpr({ ...base, at: [{ t: "parent" }, { t: "bogus" }] })).toBe(false);
  });

  it("NAV.OFFSET.TREE: a space needs both parentOf and childrenOf for the tree offset, and an unknown focus has no siblings", () => {
    const base = { kind: "tree" as const, keys: ["A"], has: (k: string): k is string => k === "A", get: () => ({}), coords: () => undefined, keyAt: () => undefined };
    const onlyParent: Space = { ...base, parentOf: () => undefined };
    const onlyChildren: Space = { ...base, childrenOf: () => [] };
    for (const sp of [onlyParent, onlyChildren]) expect(error(applyMove(sp, { origin: "A", focus: "A" }, offset(1))).kind).toBe("no-offset");
    const t = space.tree({ a: 1, b: 2 }, {});
    const outside = error(applyMove(t, { origin: "a", focus: "zz" }, offset(1)));
    expect([outside.kind, outside.message]).toEqual(["out-of-bounds", 'the offset [1] from "zz" is outside its siblings']);
  });

  it("SHEET.CELL: a cell reference that is not valid gives #VALUE! with the path of the node", () => {
    const run = new SheetRun(new Map([["a", app("add", lit(1), ext("vex.cell", { nope: 1 }))]]), { space: space.record({ A: {} }), domains: [] });
    const r = error(run.cell("a", "A"));
    expect([r.code, r.path]).toEqual(["#VALUE!", [1]]);
  });
});
