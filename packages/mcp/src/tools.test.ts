import { describe, expect, it } from "vitest";
import { check, dataOf, DEFAULT_DOMAINS, domainsOf, evaluateAll, explainAt, jsonOf, moduleOf, programOf, spaceOf, ToolError } from "./tools.ts";
import { Vec2 } from "@mark1russell7/vex-domains";

const vec = (x: number, y: number): unknown => ({ $vex: "domain", domain: "Vec2", value: [x, y] });
const ref = (field: string): unknown => ({ tag: "ref", path: [field] });
const app = (op: string, ...args: unknown[]): unknown => ({ tag: "app", op, args });
const lit = (value: unknown): unknown => ({ tag: "lit", value });
const all = (body: unknown): unknown => ({ tag: "each", axis: { t: "all" }, body });

describe("the inputs of the tools", () => {
  it("names the domains by their import name or their own name, in the order of the input", () => {
    expect(domainsOf(undefined)).toBe(DEFAULT_DOMAINS);
    expect(domainsOf(["Vec2Domain", "Num"]).map((d) => d.name)).toEqual(["Vec2", "Num"]);
    expect(() => domainsOf(["Nope"])).toThrow(ToolError);
    expect(() => domainsOf(["Nope"])).toThrow(/no domain has the name "Nope"/);
  });

  it("reads a program as JSON data or as JSON text, and gives the reason for a program that is not valid", () => {
    expect(programOf(app("add", ref("n"), lit(1)), DEFAULT_DOMAINS)).toEqual({ tag: "app", op: "add", args: [{ tag: "ref", path: ["n"] }, { tag: "lit", value: 1 }] });
    expect(programOf('{"tag":"lit","value":2}', DEFAULT_DOMAINS)).toEqual({ tag: "lit", value: 2 });
    expect(() => programOf({ tag: "loop" }, DEFAULT_DOMAINS)).toThrow('the program is not valid: the JSON is not a valid Vex expression. the expression has a node with the tag "loop", and this version of Vex does not know it');
    expect(() => programOf("not json", DEFAULT_DOMAINS)).toThrow("the program is not valid: the text is not JSON.");
  });

  it("DOC.ENTRY: reads a program as a document, as JSON data or as JSON text, and gives the location of a part that is not valid", () => {
    const document = { type: ["ops", "add"], value: [{ type: "ref", value: ["self", "n"] }, 1] };
    expect(programOf(document, DEFAULT_DOMAINS)).toEqual(app("add", ref("n"), lit(1)));
    expect(programOf(JSON.stringify(document), DEFAULT_DOMAINS)).toEqual(app("add", ref("n"), lit(1)));
    expect(() => programOf({ type: ["ops", "add"], value: [{ type: "ref", value: ["world", "n"] }] }, DEFAULT_DOMAINS)).toThrow(
      new ToolError('the program is not valid: the document is not valid at "/value/0/value/0": The root world is not open here. The open roots are self, names.'),
    );
  });

  it("reads the values of domains in data, and gives the JSON form of a value", () => {
    expect(dataOf({ size: vec(1, 2) }, DEFAULT_DOMAINS)).toEqual({ size: new Vec2(1, 2) });
    expect(() => dataOf({ $vex: "domain", domain: "Nope", value: 1 }, DEFAULT_DOMAINS)).toThrow('the data is not valid: no domain "Nope" decodes a literal');
    expect(jsonOf(new Vec2(1, 2), DEFAULT_DOMAINS)).toEqual(vec(1, 2));
    expect(jsonOf(3, DEFAULT_DOMAINS)).toBe(3);
    // A value without a JSON form gives its text.
    expect(jsonOf(new Vec2(1, 2), [])).toEqual({ text: "(1, 2)" });
    expect(jsonOf(() => 1, DEFAULT_DOMAINS)).toEqual({ text: "() => 1" });
  });

  it("makes each kind of space, and gives the reason for records of the wrong shape", () => {
    expect(spaceOf({ kind: "array", records: [{ n: 1 }, { n: 2 }] }, DEFAULT_DOMAINS).keys).toEqual(["0", "1"]);
    expect(spaceOf({ kind: "record", records: { A: { n: 1 } } }, DEFAULT_DOMAINS).keys).toEqual(["A"]);
    expect(spaceOf({ kind: "grid", records: [[{ n: 1 }, { n: 2 }]] }, DEFAULT_DOMAINS).keys).toEqual(["0,0", "0,1"]);
    expect(spaceOf({ kind: "tree", records: { r: {}, c: {} }, parents: { c: "r" } }, DEFAULT_DOMAINS).keys).toEqual(["r", "c"]);
    expect(spaceOf({ kind: "graph", records: { a: {}, b: {} }, edges: { a: ["b"] } }, DEFAULT_DOMAINS).keys).toEqual(["a", "b"]);
    expect(spaceOf({ kind: "tree", records: { r: {} } }, DEFAULT_DOMAINS).keys).toEqual(["r"]);
    expect(spaceOf({ kind: "graph", records: { a: {} } }, DEFAULT_DOMAINS).keys).toEqual(["a"]);
    expect(() => spaceOf({ kind: "array", records: {} }, DEFAULT_DOMAINS)).toThrow("a space of the kind array needs a list of records");
    expect(() => spaceOf({ kind: "grid", records: [1] }, DEFAULT_DOMAINS)).toThrow("a space of the kind grid needs a list of rows of records");
    expect(() => spaceOf({ kind: "record", records: [] }, DEFAULT_DOMAINS)).toThrow("a space of the kind record needs an object of records by key");
    expect(() => spaceOf({ kind: "tree", records: null }, DEFAULT_DOMAINS)).toThrow("a space of the kind tree needs an object of records by key");
  });
});

describe("the tools", () => {
  it("vex_check gives the size, the nesting, the reads and the tier of a program", () => {
    expect(check({ program: app("add", ref("n"), app("sum", all(ref("w")))) })).toEqual({
      ok: true,
      nodes: 5,
      nesting: 4,
      reads: [
        { path: "n", at: [], axes: [] },
        { path: "w", at: [], axes: ["all"] },
      ],
      tier2: "the compiler gives generated code",
    });
    // A program nested deeper than 500 levels has no generated code.
    let deep: unknown = lit(1);
    for (let i = 0; i < 501; i++) deep = app("add", deep, lit(1));
    expect(check({ program: deep })).toMatchObject({ tier2: "tier 1 only: the expression is nested deeper than 500 levels" });
  });

  it("vex_evaluate gives the value or the error at each key: the cell of a grid as one vector", () => {
    // The component-wise maximum of the sizes, at least 1 by 1.
    const cell = app("max", app("reduce", all(ref("size")), lit("max")), lit(1));
    const space = { kind: "array" as const, records: [{ size: vec(10, 20) }, { size: vec(30, 5) }] };
    expect(evaluateAll({ program: cell, space })).toEqual([
      { key: "0", ok: true, value: vec(30, 20) },
      { key: "1", ok: true, value: vec(30, 20) },
    ]);
    // An error has its code, its kind, its message and the path of its node. A variable can hold a value of a domain.
    expect(evaluateAll({ program: app("add", ref("missing"), lit(1)), space, origins: ["1"] })).toEqual([
      { key: "1", ok: false, error: { code: "#N/A", kind: "missing-field", message: expect.any(String) as unknown, path: [0] } },
    ]);
    expect(evaluateAll({ program: app("add", ref("size"), { tag: "var", name: "d" }), space, vars: { d: vec(1, 1) }, domains: ["Vec2Domain"] })).toEqual([
      { key: "0", ok: true, value: vec(11, 21) },
      { key: "1", ok: true, value: vec(31, 6) },
    ]);
    // A list gives each item with its key.
    expect(evaluateAll({ program: all(ref("size")), space, origins: ["0"] })).toEqual([
      { key: "0", ok: true, value: { list: [{ key: "0", ok: true, value: vec(10, 20) }, { key: "1", ok: true, value: vec(30, 5) }] } },
    ]);
  });

  it("vex_explain gives the trace at one key", () => {
    const text = explainAt({ program: app("add", ref("n"), lit(1)), space: { kind: "array", records: [{ n: 2 }] }, origin: "0" });
    expect(text).toContain("add");
    expect(text).toContain("3");
  });

  it("vex_module gives the source of a module, or the reason that the program cannot be one", () => {
    const m = moduleOf({ program: app("add", ref("n"), lit(1)), domains: ["NumDomain"], schema: { fields: { n: "number" } }, name: "plusOne" }) as { readonly ok: boolean; readonly source: string };
    expect(m.ok).toBe(true);
    expect(m.source).toContain("export function plusOne(");
    expect(moduleOf({ program: { tag: "ext", kind: "note", data: null }, schema: {} })).toEqual({ ok: false, reason: 'the extension "note"' });
    // COMPILE.MODULE.TREE: the module of a tree space takes the parents.
    const children = { tag: "each", axis: { t: "children" }, body: ref("n") };
    const tree = moduleOf({ program: app("count", children), schema: { fields: { n: "number" } }, space: "tree" }) as { readonly ok: boolean; readonly source: string };
    expect(tree.source).toContain("export function run(records, vars, parents) {");
  });
});
