import { describe, expect, it } from "vitest";
import { app, defineDomain, fail, lit, ok, space, vexError, vexList, type ListOp, type VexList } from "./index.ts";
import { evaluate, listOps } from "./evaluate.ts";

const good = (key: string, value: unknown) => ({ key, result: ok(value) });
const bad = vexError("kind-mismatch", "an item", { origin: "x", focus: "x" });
const list: VexList = vexList([good("a", 1), good("b", 2), { key: "c", result: fail(bad) }]);
const number = defineDomain({ name: "n", primitive: "number", is: (u: unknown): u is number => typeof u === "number", ops: { add: { fn: (a: number, b: number): number => a + b } } });
const position = { origin: "o", focus: "o" };
const s = space.array([{ n: 1 }]);

describe("LIST.OPS: the list ops of compile for the values of a host", () => {
  const cases: readonly (readonly [ListOp, readonly unknown[]])[] = [
    ["count", []],
    ["take", [1]],
    ["nth", [9]],
    ["get", ["z"]],
    ["get", ["b"]],
    ["get", ["a", { strict: true }]],
    ["sum", [{ strict: true }]],
    ["reduce", ["add"]],
  ];

  it.each(cases)("LIST.OPS: %s gives the result of evaluate", (op, rest) => {
    const ops = listOps({ domains: [number] });
    const r = evaluate(app(op, lit(list), ...rest.map((x) => lit(x))), { domains: [number], space: s, origin: "0" });
    const at = r.ok || r.error === bad ? r : { ...r, error: { ...r.error, origin: "o", focus: "o" } };
    expect(ops.list(op, list, rest, position, [])).toStrictEqual(at);
  });

  it("LIST.OPS: an error of the op has the position and the path of the call, and an error of an item keeps its own", () => {
    const ops = listOps();
    const path = [1, 2];
    const here = { origin: "p", focus: "q" };
    expect(ops.list("nth", list, [9], here, path)).toMatchObject({ ok: false, error: { op: "nth", origin: "p", focus: "q", path: [1, 2] } });
    expect(ops.list("first", list, [{ strict: true }], here, path)).toStrictEqual(fail(bad));
  });

  it("LIST.OPS LIST.FILL: fill gives the list of evaluate, and an error at the call", () => {
    const { fill: make } = listOps();
    expect(make([2, "x"], position, [])).toMatchObject({ ok: true, value: { items: [{ result: { value: "x" } }, { result: { value: "x" } }] } });
    expect(make([-1], { origin: "p", focus: "q" }, [3])).toMatchObject({ ok: false, error: { origin: "p", focus: "q", path: [3], op: "fill" } });
  });

  it("LIST.OPS LIST.GET: one value of listOps keeps the index of each list, so a read of a key has the same result", () => {
    const ops = listOps();
    expect(ops.list("get", list, ["b"], position, [])).toStrictEqual(ok(2));
    expect(ops.list("get", list, ["a"], position, [])).toStrictEqual(ok(1));
  });
});
