/**
 * Vex in the kernel of coeval (decision D13 of coeval): the contracts of `VEX_WORLD`, the machine of the reference tier and
 * `kernelPlan`. The property tests of `@mark1russell7/vex-testkit` compare the reference tier with the closure compiler on
 * random programs (EVAL.REFERENCE). These tests check the parts that only the kernel tier has.
 */
import { check, context, prepare, refsOf, type EvalError } from "@mark1russell7/coeval";
import { describe, expect, it } from "vitest";
import { toDocument, type Envelope } from "./document.ts";
import { vexError } from "./errors.ts";
import { compile, evaluate, MAX_NESTING, type ExtHandler } from "./evaluate.ts";
import { app, axes, call, each, ext, fn, fold, index, key, let_, lit, offset, other, parent, ref, v, type Expr } from "./ir.ts";
import { MAX_DOCUMENT_DEPTH, TERM_KINDS, toKernelError, toVexError, toVexResult, VEX_WORLD, vexMachine, vexSelf } from "./kernel.ts";
import { isVexList } from "./list.ts";
import { kernelPlan } from "./plan.ts";
import { space } from "./space.ts";
import { error, Pt, PtDomain, value } from "./test-support.ts";

const s = space.record({ A: { n: 1, p: new Pt(1, 2) }, B: { n: 2, p: new Pt(3, 4) }, N: null });
const run = (e: Expr | Envelope, origin = "A", opts: Parameters<typeof kernelPlan>[1] = { domains: [PtDomain] }): ReturnType<ReturnType<typeof kernelPlan>["run"]> => kernelPlan(e, opts).run({ space: s, origin });
const doc = (e: Expr): Envelope => value(toDocument(e, [PtDomain]));
/** A function: a literal without a JSON form. */
const one = (): number => 1;

describe("the contracts of Vex (DOC.CHECK)", () => {
  it("DOC.CHECK: the document of each kind of expression has no problem for the static kit of the kernel", () => {
    const programs: readonly Expr[] = [
      app("add", ref("n", [key("B")]), lit(1)),
      let_({ f: fn(["k"], app("add", v("k"), ref("n"))) }, call("f", lit(2))),
      fold(axes.where(axes.all, app("gt", ref("n"), lit(0))), { s: lit(0) }, { s: app("add", v("s"), ref("n")) }, v("s"), [index(lit(0))]),
      each(axes.reverse(axes.list(each(axes.all, ref("n")))), ref("n", [offset(1), other, parent])),
      ext("vex.cell", { column: "A", at: [] }),
    ];
    for (const e of programs) expect(check(vexMachine(), doc(e), { declaredType: "lit", names: "any" })).toEqual([]);
    // Without the names of the caller, the kernel finds a free name: it has no binding.
    expect(check(vexMachine(), doc(app("add", v("x"), let_({ y: lit(1) }, v("y")))), { declaredType: "lit" })).toMatchObject([{ code: "#NAME?", place: [0] }]);
    expect(TERM_KINDS.map((k) => k.join("."))).toEqual(["lit", "ref", "record", "let", "call", "each", "fold", "iterate", "ops", "ext"]);
  });

  it("DOC.CHECK DOC.ADDRESS: the address of a loop is an address for the static kit, not a read", () => {
    const uses = refsOf(VEX_WORLD, doc(each(axes.all, ref("n"), [key(ref("k"))])));
    expect(uses.map((u) => [u.path.length, u.address])).toEqual([
      [2, false],
      [2, true],
      [2, false],
    ]);
  });
});

describe("the reference tier: the kernel of coeval (EVAL.REFERENCE)", () => {
  it("EVAL.REFERENCE DOC.ENTRY: kernelPlan evaluates an expression or a document, and gives the result of the closure compiler", () => {
    const e = app("add", ref("p"), ref("p", [key("B")]));
    expect(value(run(e))).toEqual(new Pt(4, 6));
    expect(value(run(doc(e)))).toEqual(new Pt(4, 6));
    expect(kernelPlan(doc(e), { domains: [PtDomain] }).doc).toEqual(doc(e));
    expect(run(e)).toEqual(evaluate(e, { space: s, origin: "A", domains: [PtDomain] }));
  });

  it("EVAL.ORIGIN EVAL.SHAPE EVAL.NESTING: the kernel tier gives the errors of compile before an evaluation", () => {
    expect(error(run(ref("n"), "Z"))).toMatchObject({ code: "#REF!", kind: "unknown-key" });
    const bad = { tag: "nope" } as unknown as Expr;
    expect([error(run(bad)).code, error(run(bad)).message]).toEqual([error(compile(bad).run({ space: s, origin: "A" })).code, error(compile(bad).run({ space: s, origin: "A" })).message]);
    let deep: Expr = lit(1);
    for (let i = 0; i < MAX_NESTING; i++) deep = app("add", deep, lit(1));
    expect(error(run(deep)).message).toBe(`the expression is nested ${String(MAX_NESTING + 1)} levels deep, and the limit is ${String(MAX_NESTING)}`);
    expect(kernelPlan(deep).doc).toBeUndefined();
    const invalid = { type: "ref", value: ["world", "x"] } as Envelope;
    expect(error(run(invalid))).toMatchObject({ code: "#VALUE!", kind: "bad-expression" });
    expect(kernelPlan(invalid).evaluate({ space: s, origin: "A" })).toMatchObject({ ok: false, error: { code: "#VALUE!" } });
  });

  it("DOC.LITERAL: a literal without a JSON form keeps the value of the host in the kernel tier", () => {
    expect(value(run(lit(one)))).toBe(one);
    const throwing = Object.defineProperty({}, "x", { enumerable: true, get: (): never => { throw new Error("getter"); } });
    expect(value(run(lit(throwing)))).toBe(throwing);
    expect(kernelPlan(lit(one)).doc).toEqual({ type: "lit", value: one, own: { eval: "vex.host" } });
    // A decoder that throws gives #CALC! for the literal.
    const Throwing = { ...PtDomain, decode: (): never => { throw new Error("decode"); } };
    const plan = prepare(vexMachine({ domains: [Throwing] }), { type: "lit", value: { $vex: "domain", domain: "Pt", value: [1, 2] } });
    expect(plan.evaluate(context({ self: vexSelf(s, "A") }))).toMatchObject({ ok: false, error: { code: "#CALC!" } });
  });

  it("REF.MISSING NAV.COMPUTED: a position of the kernel reads the record at its focus, and a failed move fails at its use", () => {
    expect(error(run(ref([]), "N"))).toMatchObject({ code: "#N/A", kind: "missing-field" });
    expect(error(run(ref([], [key("N")])))).toMatchObject({ code: "#N/A" });
    expect(error(run(ref([], [key("Z")])))).toMatchObject({ code: "#REF!", kind: "unknown-key" });
    expect(error(run(ref("n", [key("Z"), key("A")])))).toMatchObject({ code: "#REF!", message: 'the space has no key "Z"' });
    // The check of a computed key comes before the moves (NAV.COMPUTED).
    expect(error(run(ref("n", [key("Z"), key(lit(1))])))).toMatchObject({ code: "#VALUE!" });
    expect(error(run(each(axes.all, ref("n"), [key("Z")])))).toMatchObject({ code: "#REF!" });
    // A move that does not start at a position: only a document that is not of Vex has it.
    const machine = vexMachine();
    const afterField = { type: "ref", value: ["self", "n", { type: ["moves", "parent"], value: null }] };
    expect(prepare(machine, afterField).evaluate(context({ self: vexSelf(s, "A") }))).toMatchObject({ ok: false, error: { code: "#REF!" } });
    // A context without a position.
    expect(prepare(machine, doc(each(axes.all, lit(1)))).evaluate(context({}))).toMatchObject({ ok: false, error: { code: "#REF!" } });
    expect(vexSelf(s, "A")).toMatchObject({ label: "key A", origin: "A", focus: "A" });
    const self = vexSelf(s, "A") as { deref(k: string): unknown; toJson(): unknown };
    expect([self.deref("n"), self.deref("constructor"), self.toJson()]).toEqual([1, undefined, { n: 1, p: new Pt(1, 2) }]);
  });

  it("FN.VALUE FN.CALL: a function of a let is not a value, and a call of a value or of a name without a binding fails", () => {
    expect(error(run(let_({ f: fn([], lit(1)) }, v("f"))))).toMatchObject({ code: "#VALUE!", message: "the name is a function, not a value" });
    expect(error(run(let_({ f: lit(1) }, call("f"))))).toMatchObject({ code: "#VALUE!" });
    expect(error(run(call("f")))).toMatchObject({ code: "#NAME?" });
    const add = { domains: [PtDomain], fns: { add: (a: unknown, b: unknown): number => (a as number) + (b as number) } };
    expect(value(run(let_({ f: fn(["k"], app("add", v("k"), ref("n"))) }, call("f", lit(2))), "B", add))).toBe(4);
    // The body evaluates at the position of the call: inside an axis, at each target.
    const e = let_({ f: fn([], ref("n")) }, each(axes.all, call("f")));
    const items = value(run(e));
    expect(isVexList(items) ? items.items.map((item) => (item.result.ok ? item.result.value : item.result.error.code)) : items).toEqual([1, 2, "#N/A"]);
  });

  it("EVAL.LOCATION SHEET.CELL: an extension gets the position, and an error without an origin gets its position", () => {
    const seen: string[] = [];
    const extensions: Readonly<Record<string, ExtHandler>> = {
      where: (data, ctx) => {
        seen.push(`${String(data)}@${ctx.position.focus}`);
        return { ok: true, value: ctx.position.origin };
      },
      bad: () => ({ ok: false, error: vexError("bad-expression", "no") }),
      placed: () => ({ ok: false, error: vexError("bad-expression", "here", { origin: "B", focus: "B" }) }),
    };
    expect(value(run(ext("where", 7), "B", { extensions }))).toBe("B");
    expect(seen).toEqual(["7@B"]);
    expect(error(run(ext("bad", null), "B", { extensions }))).toMatchObject({ code: "#VALUE!", origin: "B", focus: "B" });
    expect(error(run(ext("placed", null), "A", { extensions }))).toMatchObject({ origin: "B" });
    // Vex has no standard extension of the kernel: each kind needs its handler.
    for (const kind of ["undefined", "number", "nope"]) expect(error(run(ext(kind, "NaN")))).toMatchObject({ code: "#NAME?" });
    expect(prepare(vexMachine({ extensions }), doc(ext("where", 1))).evaluate(context({}))).toMatchObject({ ok: false, error: { code: "#REF!" } });
  });

  it("EVAL.REFERENCE: the errors of the kernel and of Vex convert both ways", () => {
    const vex = vexError("missing-field", "x");
    expect(toVexError(toKernelError(vex))).toBe(vex);
    const kernel: EvalError = { code: "#KIND?", reason: "The world has no kind x." };
    expect(toVexError(kernel)).toMatchObject({ code: "#VALUE!", kind: "bad-expression", message: "The world has no kind x." });
    const cause = new Error("boom");
    expect(toVexError({ code: "#CALC!", reason: "threw", cause })).toMatchObject({ code: "#CALC!", kind: "threw", thrown: cause });
    expect(toVexResult({ ok: true, value: 1 })).toEqual({ ok: true, value: 1 });
    expect(MAX_DOCUMENT_DEPTH).toBeGreaterThan(MAX_NESTING * 3);
  });
});
